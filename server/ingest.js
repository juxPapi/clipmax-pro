// Link ingest through yt-dlp: Twitch VODs and clips, YouTube, Kick, X, and any
// direct media URL. The download never leaves the machine.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { findExecutable } from './binaries.js';

export const YTDLP = findExecutable('yt-dlp', 'YTDLP_PATH', ['yt-dlp.yt-dlp']);

export async function ytDlpVersion() {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, ['--version'], { windowsHide: true });
    let out = '';
    child.stdout?.on('data', (data) => (out += data.toString()));
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? out.trim() : null));
  });
}

/**
 * Download the best mp4 rendition and return its path plus the metadata sidecar.
 * Progress comes from yt-dlp's `--newline` output.
 */
// Prefer a modest progressive MP4 so very long streams don't try to pull a
// 70+ GB 1440p webm. Falls back progressively if unavailable.
const SAFE_FORMAT = 'b[ext=mp4][height<=480]/bv*[ext=mp4][height<=480]+ba[ext=m4a]/b[height<=480]/bv*[height<=480]+ba/b';

export async function downloadUrl(url, { dir, id, onProgress, onLog, section = null, format = null } = {}) {
  await fs.mkdir(dir, { recursive: true });
  const outputTemplate = path.join(dir, `${id}.%(ext)s`);
  const args = [
    '--no-warnings',
    '--no-playlist',
    '--newline',
    '--no-part',
    '--write-info-json',
    '--no-mtime',
    // For long streams, capture only a section. yt-dlp requires a leading "*"
    // to mean "from time zero" (e.g. "*0-1800" = first 30 min).
    ...(section
      ? ['--download-sections', section.trim().startsWith('*') ? section.trim() : `*${section.trim()}`, '--force-keyframes-at-cuts']
      : []),
    '-f', format || SAFE_FORMAT,
    '--merge-output-format', 'mp4',
    '--remux-video', 'mp4',
    '-o', outputTemplate,
    url,
  ];

  onLog?.('Asking yt-dlp for a moderate mp4 rendition…');

  // Guard against filling the drive on very long streams.
  try {
    const stats = await fs.statfs(dir);
    const freeGB = (stats.bavail * stats.bsize) / 1e9;
    if (freeGB < 2) {
      throw new Error(`Only ${freeGB.toFixed(1)} GB free on disk — free up space before downloading.`);
    }
  } catch (error) {
    if (/free on disk/.test(error.message)) throw error;
  }

  await new Promise((resolve, reject) => {
    const child = spawn(YTDLP, args, { windowsHide: true });
    let stderr = '';
    child.stdout?.on('data', (data) => {
      const text = data.toString();
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        const percent = /\[download\]\s+([\d.]+)%/.exec(line);
        if (percent) onProgress?.(Math.min(96, Number(percent[1]) * 0.96));
        else if (/^\[(Merger|VideoRemuxer|ExtractAudio|Fixup)/.test(line)) {
          onLog?.(line.replace(/^\[|\]$/g, '').slice(0, 160));
          onProgress?.(98);
        } else if (/^\[(youtube|twitch|instagram|TikTok|twitter|x)/i.test(line) && /Downloading|Extracting/i.test(line)) {
          onLog?.(line.slice(0, 160));
        }
      }
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp could not fetch that link.\n${stderr.slice(-900)}`));
    });
  });

  const files = await fs.readdir(dir);
  const media = files
    .filter((file) => file.startsWith(`${id}.`) && !file.endsWith('.info.json') && !file.endsWith('.part'))
    .sort((a, b) => (a.endsWith('.mp4') ? -1 : 1))
    .find((file) => /\.(mp4|mkv|webm|mov|m4v)$/i.test(file));
  if (!media) throw new Error('yt-dlp finished but left no media file behind.');

  let metadata = {};
  try {
    metadata = JSON.parse(await fs.readFile(path.join(dir, `${id}.info.json`), 'utf8'));
  } catch {
    /* metadata is a bonus, not a requirement */
  }

  return {
    file: path.join(dir, media),
    ext: path.extname(media).slice(1),
    metadata: {
      title: metadata.title || null,
      uploader: metadata.uploader || metadata.channel || null,
      duration: Number(metadata.duration) || null,
      webpageUrl: metadata.webpage_url || url,
      thumbnail: metadata.thumbnail || null,
      extractor: metadata.extractor_key || metadata.extractor || null,
      live: Boolean(metadata.is_live),
    },
  };
}

export function isProbablyUrl(value) {
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
