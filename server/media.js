// FFmpeg and FFprobe: probing, audio extraction, previews, thumbnails and the
// final vertical render with burned-in captions.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAss } from '../shared/captions.js';
import { composeLayout } from '../shared/framing.js';
import { findExecutable } from './binaries.js';

const FFMPEG_PACKAGES = ['Gyan.FFmpeg', 'yt-dlp.FFmpeg'];

export const FFMPEG = findExecutable('ffmpeg', 'FFMPEG_PATH', FFMPEG_PACKAGES);
export const FFPROBE = findExecutable('ffprobe', 'FFPROBE_PATH', FFMPEG_PACKAGES);

function run(command, args, { cwd, onStdout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      onStdout?.(text);
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > 24000) stderr = stderr.slice(-24000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} exited with ${code}\n${stderr.slice(-1400)}`));
    });
  });
}

function makeProgressReader(duration, onProgress) {
  return (chunk) => {
    if (!duration || !onProgress) return;
    const match = /out_time=(\d+):(\d+):([\d.]+)/.exec(chunk);
    if (!match) return;
    const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    onProgress(Math.min(99, (seconds / duration) * 100));
  };
}

export async function probe(file) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    file,
  ]);
  const data = JSON.parse(stdout);
  const video = data.streams.find((stream) => stream.codec_type === 'video');
  const audio = data.streams.find((stream) => stream.codec_type === 'audio');
  if (!video) throw new Error('That file has no video stream.');
  const duration = Number(data.format?.duration || video.duration || 0);
  const [num, den] = String(video.avg_frame_rate || '30/1').split('/').map(Number);
  const rotation = Math.abs(
    Number(video.side_data_list?.find((item) => item.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0)
  );
  return {
    duration,
    width: Number(video.width),
    height: Number(video.height),
    fps: den ? num / den : 30,
    hasAudio: Boolean(audio),
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name || null,
    rotation,
    size: Number(data.format?.size || 0),
  };
}

export async function version(output = 'stdout') {
  try {
    const { stdout } = await run(FFMPEG, ['-version']);
    return stdout.split(/\r?\n/)[0].replace('ffmpeg version ', '').split(' ')[0];
  } catch {
    return null;
  }
}

/** Chromium preview copy: H.264/AAC, capped at 1280px. */
export async function makePlaybackCopy(input, output, { width, height, duration, hasAudio = true, onProgress } = {}) {
  const cap = 1280;
  const ratio = Math.min(1, cap / Math.max(1, width || cap), cap / Math.max(1, height || cap));
  const even = (value) => Math.max(2, Math.round((value * ratio) / 2) * 2);
  const outW = even(width || cap);
  const outH = even(height || cap);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await run(
    FFMPEG,
    [
      '-hide_banner', '-y',
      '-i', input,
      '-vf', `scale=${outW}:${outH}:flags=bicubic,fps=30`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p',
      ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an']),
      '-movflags', '+faststart',
      '-progress', 'pipe:1', '-nostats',
      output,
    ],
    { onStdout: makeProgressReader(duration, onProgress) }
  );
  return output;
}

/** 16 kHz mono PCM, the only input Whisper needs. */
export async function extractAudio(input, output, duration, onProgress) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await run(
    FFMPEG,
    [
      '-hide_banner', '-y',
      '-i', input,
      '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le',
      '-progress', 'pipe:1', '-nostats',
      output,
    ],
    { onStdout: makeProgressReader(duration, onProgress) }
  );
  return output;
}

export async function makeThumb(input, output, at = 1) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await run(FFMPEG, [
    '-hide_banner', '-y',
    '-ss', String(Math.max(0, at)),
    '-i', input,
    '-frames:v', '1',
    '-vf', 'scale=640:-2:flags=bicubic',
    output,
  ]);
  return output;
}

function parseWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
  let offset = 12;
  let channels = 1;
  let bitDepth = 16;
  let sampleRate = 16000;
  let dataOffset = 0;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitDepth = buffer.readUInt16LE(offset + 22);
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataLength = Math.min(size, buffer.length - dataOffset);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (!dataOffset) return null;
  return { channels, bitDepth, sampleRate, dataOffset, dataLength };
}

/**
 * Read the extracted WAV once and produce the two curves the studio draws:
 * loudness energy (for scoring and the heatmap) and waveform peaks.
 */
export async function analyzeAudio(wavPath) {
  const buffer = await fs.readFile(wavPath);
  const info = parseWav(buffer);
  if (!info || info.bitDepth !== 16) {
    return { energy: [], peaks: [], binSeconds: 0.5, duration: 0 };
  }
  const { channels, dataOffset, dataLength, sampleRate } = info;
  const frames = Math.floor(dataLength / (2 * channels));
  const duration = frames / sampleRate;
  const binCount = Math.max(1, Math.min(24000, Math.ceil(duration / 0.5)));
  const samplesPerBin = Math.max(1, Math.floor(frames / binCount));
  const stride = Math.max(1, Math.floor(samplesPerBin / 9000));

  const rms = new Float64Array(binCount);
  const peakBins = 480;
  const peaks = new Float64Array(peakBins);
  const samplesPerPeak = Math.max(1, Math.floor(frames / peakBins));

  let maxRms = 1e-6;
  for (let bin = 0; bin < binCount; bin += 1) {
    const start = bin * samplesPerBin;
    const end = Math.min(frames, start + samplesPerBin);
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i += stride) {
      const sample = buffer.readInt16LE(dataOffset + i * 2 * channels) / 32768;
      sum += sample * sample;
      count += 1;
    }
    rms[bin] = Math.sqrt(sum / Math.max(1, count));
    if (rms[bin] > maxRms) maxRms = rms[bin];
  }

  for (let bin = 0; bin < peakBins; bin += 1) {
    const start = bin * samplesPerPeak;
    const end = Math.min(frames, start + samplesPerPeak);
    let peak = 0;
    const step = Math.max(1, Math.floor((end - start) / 200));
    for (let i = start; i < end; i += step) {
      const sample = Math.abs(buffer.readInt16LE(dataOffset + i * 2 * channels) / 32768);
      if (sample > peak) peak = sample;
    }
    peaks[bin] = peak;
  }
  const maxPeak = Math.max(1e-6, ...peaks);
  const energy = Array.from(rms, (value) => {
    const db = 20 * Math.log10(Math.max(value, 1e-6) / maxRms);
    return Number(Math.max(0, Math.min(1, (db + 46) / 46)).toFixed(3));
  });
  return {
    energy,
    peaks: Array.from(peaks, (value) => Number((value / maxPeak).toFixed(3))),
    binSeconds: duration / Math.max(1, energy.length),
    duration,
    sampleRate,
  };
}

/** Energy stats for an arbitrary time range, used by the clip scorer. */
export function energyForRange(analysis, start, end) {
  if (!analysis?.energy?.length || !analysis.binSeconds) return null;
  const from = Math.max(0, Math.floor(start / analysis.binSeconds));
  const to = Math.min(analysis.energy.length, Math.ceil(end / analysis.binSeconds));
  if (to <= from) return null;
  let sum = 0;
  let peak = 0;
  let count = 0;
  for (let i = from; i < to; i += 1) {
    const value = analysis.energy[i] || 0;
    sum += value;
    if (value > peak) peak = value;
    count += 1;
  }
  const average = sum / Math.max(1, count);
  return {
    average: Number(average.toFixed(3)),
    peak: Number(peak.toFixed(3)),
    lift: Number(Math.max(0, peak - average).toFixed(3)),
  };
}

function layoutGraph({ layout, width, height, srcW, srcH, frame, facecam }) {
  const plan = composeLayout({ layout, srcW, srcH, width, height, frame, facecam });
  const crop = (box) => `crop=${box.cropW}:${box.cropH}:${box.x}:${box.y}`;

  if (plan.mode === 'blur') {
    const fg = plan.foreground;
    return [
      '[0:v]split=2[bg][fg]',
      `[bg]${crop(plan.backdrop)},scale=${width}:${height}:flags=bicubic,gblur=sigma=${plan.sigma.toFixed(1)}[bgb]`,
      `[fg]scale=${fg.width}:${fg.height}:flags=lanczos[fgs]`,
      `[bgb][fgs]overlay=${fg.x}:${fg.y}[composed]`,
    ].join(';');
  }

  if (plan.mode === 'facecam') {
    const crop = (box) => `crop=${box.cropW}:${box.cropH}:${box.x}:${box.y}`;
    return [
      '[0:v]split=2[face][game]',
      `[face]${crop(plan.face)},scale=${width}:${plan.topH}:flags=lanczos,setsar=1[faceTop]`,
      `[game]${crop(plan.game)},scale=${width}:${plan.bottomH}:flags=lanczos,setsar=1[gameBottom]`,
      '[faceTop][gameBottom]vstack=inputs=2[composed]',
    ].join(';');
  }

  if (plan.mode === 'tiles') {
    const { tiles, tileH, box } = plan;
    const labels = (prefix) => Array.from({ length: tiles }, (_, index) => `[${prefix}${index}]`).join('');
    const parts = [`[0:v]split=${tiles}${labels('p')}`];
    for (let i = 0; i < tiles; i += 1) {
      parts.push(`[p${i}]${crop(box)},scale=${width}:${tileH}:flags=lanczos[t${i}]`);
    }
    parts.push(`${labels('t')}vstack=inputs=${tiles}[stacked]`);
    parts.push(`[stacked]crop=${width}:${height}:0:${plan.offsetY}[composed]`);
    return parts.join(';');
  }

  return `[0:v]${crop(plan.box)},scale=${width}:${height}:flags=lanczos[composed]`;
}

/**
 * Cut one range, reframe it, burn the captions, normalise the audio.
 * `cues` must already be relative to the clip start.
 */
export async function renderClip({
  input,
  output,
  start,
  end,
  width,
  height,
  srcW,
  srcH,
  frame = {},
  cues = [],
  style,
  layout = 'fill',
  facecam = {},
  fps = 60,
  hasAudio = true,
  watermark = null,
  onProgress,
}) {
  const dir = path.dirname(output);
  await fs.mkdir(dir, { recursive: true });
  const duration = Math.max(0.4, end - start);
  const assName = `cap-${path.basename(output, '.mp4')}.ass`;
  await fs.writeFile(path.join(dir, assName), buildAss({ width, height, cues, style, watermark, duration }), 'utf8');

  const filter = [
    layoutGraph({ layout, width, height, srcW, srcH, frame, facecam }),
    `[composed]setsar=1,ass=${assName},fps=${fps}[vout]`,
  ].join(';');

  await run(
    FFMPEG,
    [
      '-hide_banner', '-y',
      '-ss', String(start),
      '-i', input,
      '-t', String(duration),
      '-filter_complex', filter,
      '-map', '[vout]',
      ...(hasAudio
        ? ['-map', '0:a?', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000']
        : ['-an']),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-progress', 'pipe:1', '-nostats',
      output,
    ],
    { cwd: dir, onStdout: makeProgressReader(duration, onProgress) }
  );

  const stats = await fs.stat(output);
  return { path: output, size: stats.size, duration };
}

export function tempDir() {
  return path.join(os.tmpdir(), 'faceless-render');
}
