// The pipeline: ingest → probe → preview → audio analysis → Whisper → clips →
// ready. Every step reports through the job registry and is persisted.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DATA_DIR,
  EXPORT_DIR,
  TMP_DIR,
  UPLOAD_DIR,
  getProject,
  saveProject,
  getSettings,
  listProjects,
} from './store.js';
import { createJob, updateJob, progress, finishJob, failJob } from './jobs.js';
import { emitEvent } from './events.js';
import {
  FFMPEG,
  analyzeAudio,
  extractAudio,
  makePlaybackCopy,
  makeThumb,
  probe,
  renderClip,
  renderSplitPane,
} from './media.js';
import { transcribe } from './asr.js';
import { buildHeatCurve, findClips } from './clips.js';
import { downloadUrl } from './ingest.js';
import { ASPECTS, LANGUAGES, resolveLayout, resolveStyle, toCues } from '../shared/captions.js';

const MAX_CLIP_LIMIT = 16;

function newId() {
  return `p_${crypto.randomBytes(6).toString('hex')}`;
}

function safeName(value, fallback = 'Untitled source') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, 120);
}

function baseNameFromFile(file) {
  return safeName(path.basename(file, path.extname(file)), 'Untitled source');
}

export function publicProject(project) {
  if (!project) return null;
  const { transcript, ...rest } = project;
  return {
    ...rest,
    filePath: undefined,
    playbackPath: undefined,
    thumbPath: undefined,
    transcript: transcript
      ? { text: transcript.text, language: transcript.language, model: transcript.model, wordCount: transcript.words?.length || 0 }
      : null,
    mediaUrl: project.filePath ? `/api/media/source/${project.id}` : null,
    playbackUrl: project.playbackPath ? `/api/media/playback/${project.id}` : null,
    thumbUrl: `/api/projects/${project.id}/thumb`,
  };
}

async function touch(project) {
  await saveProject(project);
  emitEvent('project', { project: publicProject(project) });
  return project;
}

function setStage(project, job, stage, pct, note = '') {
  project.progress = { stage, pct: Math.round(pct), note };
  progress(job.id, stage, pct, note);
  if (note) emitEvent('log', { projectId: project.id, line: note });
}

/** Download a link, then run the full analysis on the result. */
export async function startUrlProject(url, options = {}) {
  const id = newId();
  const now = new Date().toISOString();
  const project = {
    id,
    name: 'Fetching link…',
    source: { type: 'url', url },
    filePath: null,
    playbackPath: null,
    thumbPath: null,
    duration: 0,
    width: 0,
    height: 0,
    fps: 0,
    hasAudio: false,
    status: 'downloading',
    progress: { stage: 'queued', pct: 0, note: '' },
    transcript: null,
    analysis: null,
    clips: [],
    exports: [],
    model: null,
    language: 'auto',
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  await touch(project);

  const job = createJob({ type: 'ingest', projectId: id, label: 'Fetch link' });
  runUrlPipeline(project, job, url, options).catch(() => {});
  return project;
}

async function runUrlPipeline(project, job, url, options = {}) {
  try {
    setStage(project, job, 'download', 2, 'yt-dlp is fetching the stream…');
    await touch(project);
    const result = await downloadUrl(url, {
      dir: UPLOAD_DIR,
      id: project.id,
      onProgress: (pct) => {
        project.progress = { stage: 'download', pct: Math.round(pct), note: '' };
        progress(job.id, 'download', pct, '');
        emitEvent('project', { project: publicProject(project) });
      },
      onLog: (line) => emitEvent('log', { projectId: project.id, line }),
      section: options.section || null,
      format: options.format || null,
    });

    project.filePath = result.file;
    project.name = safeName(result.metadata.title, baseNameFromFile(result.file));
    project.source = {
      type: 'url',
      url,
      uploader: result.metadata.uploader,
      extractor: result.metadata.extractor,
      webpageUrl: result.metadata.webpageUrl,
    };
    await finishJob(job.id, { filePath: result.file });
    await touch(project);
    await analyzeProject(project, { model: null, language: 'auto', newJob: true });
  } catch (error) {
    project.status = 'failed';
    project.error = String(error?.message || error);
    project.progress = { stage: 'failed', pct: 100, note: '' };
    failJob(job.id, error);
    await touch(project);
  }
}

/** Adopt an uploaded temp file as a project and start analysis. */
export async function startFileProject({ tempPath, originalName, size }) {
  const id = newId();
  const ext = path.extname(originalName || tempPath).toLowerCase() || '.mp4';
  const destination = path.join(UPLOAD_DIR, `${id}${ext}`);
  await fs.rename(tempPath, destination).catch(async (error) => {
    if (error.code === 'EXDEV') {
      await fs.copyFile(tempPath, destination);
      await fs.rm(tempPath, { force: true });
    } else {
      throw error;
    }
  });

  const now = new Date().toISOString();
  const project = {
    id,
    name: baseNameFromFile(originalName || 'Untitled source'),
    source: { type: 'file', originalName, size: size || null },
    filePath: destination,
    playbackPath: null,
    thumbPath: null,
    duration: 0,
    width: 0,
    height: 0,
    fps: 0,
    hasAudio: false,
    status: 'analyzing',
    progress: { stage: 'queued', pct: 0, note: '' },
    transcript: null,
    analysis: null,
    clips: [],
    exports: [],
    model: null,
    language: 'auto',
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  await touch(project);

  const job = createJob({ type: 'analyze', projectId: id, label: 'Analyze source' });
  analyzeProject(project, { model: null, language: 'auto', job }).catch(() => {});
  return project;
}

/** Re-run transcription and scoring with a chosen model/language. */
export async function reanalyzeProject(projectId, { model, language } = {}) {
  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found.');
  project.status = 'analyzing';
  project.error = null;
  project.progress = { stage: 'queued', pct: 0, note: 'Preparing to listen again' };
  await touch(project);
  const job = createJob({ type: 'analyze', projectId, label: 'Re-analyze source' });
  analyzeProject(project, { model, language, job }).catch(() => {});
  return project;
}

export async function analyzeProject(project, options = {}) {
  const settings = await getSettings();
  const model = options.model || project.model || settings.defaults.model || 'base';
  const language = options.language || project.language || settings.defaults.language || 'auto';
  const job = options.job || createJob({ type: 'analyze', projectId: project.id, label: 'Analyze source' });

  try {
    project.status = 'analyzing';
    project.model = model;
    project.language = language;
    setStage(project, job, 'probe', 3, 'Reading the container and stream info…');
    await touch(project);

    const info = await probe(project.filePath);
    project.duration = Number(info.duration.toFixed(2));
    project.width = info.width;
    project.height = info.height;
    project.fps = Number(info.fps.toFixed(3));
    project.hasAudio = info.hasAudio;
    project.videoCodec = info.videoCodec;
    project.size = info.size;

    if (!project.hasAudio) throw new Error('That source has no audio track, so there is no speech to find.');

    setStage(project, job, 'preview', 8, 'Building a scrub copy for the player…');
    await touch(project);
    const playback = path.join(UPLOAD_DIR, `${project.id}.preview.mp4`);
    await makePlaybackCopy(project.filePath, playback, {
      width: project.width,
      height: project.height,
      duration: project.duration,
      hasAudio: project.hasAudio,
      onProgress: (pct) => {
        const mapped = 8 + pct * 0.17;
        project.progress = { stage: 'preview', pct: Math.round(mapped), note: '' };
        progress(job.id, 'preview', mapped, '');
      },
    });
    project.playbackPath = playback;

    const thumb = path.join(UPLOAD_DIR, `${project.id}.jpg`);
    await makeThumb(project.filePath, thumb, Math.min(2, project.duration * 0.25));
    project.thumbPath = thumb;
    await touch(project);

    setStage(project, job, 'audio', 26, 'Extracting 16 kHz audio for the local model…');
    await touch(project);
    const wav = path.join(TMP_DIR, `${project.id}.wav`);
    await extractAudio(project.filePath, wav, project.duration, (pct) => {
      const mapped = 26 + pct * 0.08;
      project.progress = { stage: 'audio', pct: Math.round(mapped), note: '' };
      progress(job.id, 'audio', mapped, '');
    });

    setStage(project, job, 'analysis', 36, 'Measuring loudness and speech density…');
    await touch(project);
    const analysis = await analyzeAudio(wav);

    setStage(project, job, 'transcribe', 42, `Listening with ${model} Whisper… the first run downloads the model once.`);
    await touch(project);
    let transcript;
    try {
      transcript = await transcribe(wav, {
        model,
        language,
        onProgress: (pct) => {
          const mapped = 42 + pct * 0.46;
          project.progress = { stage: 'transcribe', pct: Math.round(mapped), note: '' };
          progress(job.id, 'transcribe', mapped, '');
          emitEvent('project', { project: publicProject(project) });
        },
        onLog: (line) => emitEvent('log', { projectId: project.id, line }),
      });
    } finally {
      await fs.rm(wav, { force: true });
    }

    setStage(project, job, 'score', 90, 'Scoring every candidate window…');
    await touch(project);
    const clips = findClips({
      words: transcript.words,
      duration: project.duration,
      language,
      limit: MAX_CLIP_LIMIT,
      analysis,
      minSeconds: settings.defaults.minClipSeconds || 45,
      maxSeconds: settings.defaults.maxClipSeconds || 120,
    });
    for (const clip of clips) {
      const words = transcript.words
        .filter((word) => word.end > clip.start && word.start < clip.end)
        .map((word) => ({
          start: Number((word.start - clip.start).toFixed(3)),
          end: Number((word.end - clip.start).toFixed(3)),
          text: word.text,
        }));
      clip.words = words;
      clip.captions = toCues(words, { maxWords: 4, maxChars: 24 });
      clip.focus = 0.5;
      clip.focusY = 0.5;
      clip.zoom = 1;
    }

    project.transcript = {
      text: transcript.text,
      words: transcript.words,
      language,
      model,
    };
    project.analysis = {
      ...analysis,
      heat: buildHeatCurve({ words: transcript.words, duration: project.duration, analysis }),
    };
    project.clips = clips;
    project.status = 'ready';
    project.error = null;
    project.progress = { stage: 'ready', pct: 100, note: `${clips.length} moments found` };
    setStage(project, job, 'ready', 100, `${clips.length} moments found`);
    await touch(project);
    finishJob(job.id, { clips: clips.length, duration: project.duration });
  } catch (error) {
    project.status = 'failed';
    project.error = String(error?.message || error);
    project.progress = { stage: 'failed', pct: 100, note: 'Stopped' };
    failJob(job.id, error);
    await touch(project);
  }
}

/** Render one clip with the chosen framing, aspect, layout and caption style. */
export async function renderClipJob(projectId, clipId, options = {}) {
  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found.');
  if (project.status !== 'ready' && project.status !== 'analyzing') {
    throw new Error('This project has no analyzed clips yet.');
  }
  const clip = (project.clips || []).find((entry) => entry.id === clipId);
  if (!clip) throw new Error('Clip not found.');

  const settings = await getSettings();
  const aspect = ASPECTS[options.aspect] || ASPECTS[settings.defaults.aspect] || ASPECTS['9:16'];
  const styleId = options.styleId || settings.defaults.captionStyle;
  const style = resolveStyle(styleId, {
    wordsPerCue: options.wordsPerCue || settings.defaults.wordsPerCue,
    position: options.position,
    size: options.size,
    boxOpacity: options.boxOpacity,
  });
  const layout = resolveLayout(options.layout || settings.defaults.layout);
  const facecam = options.facecam && typeof options.facecam === 'object' ? options.facecam : {};
  const fps = Number(options.fps) === 30 ? 30 : 60;
  const start = Math.max(0, Number(options.start ?? clip.start) || 0);
  const end = Math.min(project.duration, Number(options.end ?? clip.end) || clip.end);
  if (end - start < 2) throw new Error('That range is too short to render.');

  const frame = {
    focus: Number(options.focus ?? clip.focus ?? 0.5),
    focusY: Number(options.focusY ?? clip.focusY ?? 0.5),
    zoom: Number(options.zoom ?? clip.zoom ?? 1),
  };

  const words = (project.transcript?.words || [])
    .filter((word) => word.end > start && word.start < end)
    .map((word) => ({
      start: Number(Math.max(0, word.start - start).toFixed(3)),
      end: Number(Math.max(0.02, word.end - start).toFixed(3)),
      text: word.text,
    }));
  const cues = toCues(words, {
    maxWords: style.wordsPerCue || 4,
    maxChars: style.wordsPerCue >= 6 ? 34 : 24,
  });

  const width = aspect.width;
  const height = aspect.height;
  const watermark =
    settings.brand?.watermark && settings.brand?.handle ? String(settings.brand.handle).slice(0, 60) : null;

  const job = createJob({ type: 'render', projectId, label: `Render ${clip.title}` });
  const slug = String(clip.id).replace(/[^a-z0-9-]+/gi, '');
  const fileName = `${slug}-${aspect.id.replace(':', 'x')}-${Date.now().toString(36)}.mp4`;
  const outDir = path.join(EXPORT_DIR, projectId);
  const output = path.join(outDir, fileName);

  try {
    setStage(project, job, 'render', 1, `Rendering ${width}×${height} with ${style.name} captions…`);
    await touch(project);
    const result = await renderClip({
      input: project.filePath,
      output,
      start,
      end,
      width,
      height,
      srcW: project.width,
      srcH: project.height,
      frame,
      cues,
      style,
      layout,
      facecam,
      fps,
      hasAudio: project.hasAudio,
      watermark,
      onProgress: (pct) => {
        project.progress = { stage: 'render', pct: Math.round(pct), note: '' };
        progress(job.id, 'render', pct, '');
        emitEvent('project', { project: publicProject(project) });
      },
    });

    const exportRecord = {
      id: `e_${Date.now().toString(36)}`,
      file: fileName,
      clipId,
      title: clip.title,
      aspect: aspect.id,
      layout,
      styleId: style.id,
      styleName: style.name,
      width,
      height,
      start,
      end,
      duration: Number((end - start).toFixed(2)),
      size: result.size,
      createdAt: new Date().toISOString(),
      url: `/api/media/exports/${projectId}/${encodeURIComponent(fileName)}`,
      publicPath: `/api/public/exports/${projectId}/${encodeURIComponent(fileName)}`,
    };
    project.exports = [exportRecord, ...(project.exports || [])];
    project.progress = { stage: 'ready', pct: 100, note: 'Export finished' };
    await touch(project);
    finishJob(job.id, { exportId: exportRecord.id, file: fileName });
    return { export: exportRecord, jobId: job.id };
  } catch (error) {
    failJob(job.id, error);
    project.progress = { stage: 'ready', pct: 100, note: 'Render failed' };
    await touch(project);
    throw error;
  }
}

export async function renderSplitPaneJob({
  topProjectId,
  bottomProjectId,
  ratio = 0.5,
  top = {},
  bottom = {},
  fps = 60,
  hasAudio = true,
}) {
  const topProject = await getProject(topProjectId);
  const bottomProject = await getProject(bottomProjectId);
  if (!topProject?.filePath) throw new Error('Top video project not found.');
  if (!bottomProject?.filePath) throw new Error('Bottom video project not found.');

  const aspect = ASPECTS['9:16'];
  const width = aspect.width;
  const height = aspect.height;

  const topStart = Math.max(0, Number(top.start ?? 0) || 0);
  const topEnd = Math.min(topProject.duration, Number(top.end ?? topProject.duration) || topProject.duration);
  const bottomStart = Math.max(0, Number(bottom.start ?? 0) || 0);
  const bottomEnd = Math.min(bottomProject.duration, Number(bottom.end ?? bottomProject.duration) || bottomProject.duration);
  if (topEnd - topStart < 0.4) throw new Error('Top range is too short.');
  if (bottomEnd - bottomStart < 0.4) throw new Error('Bottom range is too short.');

  const topFrame = {
    focus: Number(top.focus ?? 0.5),
    focusY: Number(top.focusY ?? 0.5),
    zoom: Number(top.zoom ?? 1),
  };
  const bottomFrame = {
    focus: Number(bottom.focus ?? 0.5),
    focusY: Number(bottom.focusY ?? 0.5),
    zoom: Number(bottom.zoom ?? 1),
  };

  const settings = await getSettings();
  const styleId = settings.defaults.captionStyle;
  const style = resolveStyle(styleId, { wordsPerCue: settings.defaults.wordsPerCue });
  const watermark = settings.brand?.watermark && settings.brand?.handle ? String(settings.brand.handle).slice(0, 60) : null;

  const job = createJob({ type: 'render', projectId: topProjectId, label: 'Render split screen' });
  const slug = 'split';
  const fileName = `${slug}-${aspect.id.replace(':', 'x')}-${Date.now().toString(36)}.mp4`;
  const outDir = path.join(EXPORT_DIR, topProjectId);
  const output = path.join(outDir, fileName);

  try {
    setStage(topProject, job, 'render', 1, `Rendering ${width}×${height} split screen…`);
    await touch(topProject);
    const result = await renderSplitPane({
      topInput: topProject.filePath,
      bottomInput: bottomProject.filePath,
      output,
      topStart,
      topEnd,
      bottomStart,
      bottomEnd,
      width,
      height,
      topSrcW: topProject.width,
      topSrcH: topProject.height,
      bottomSrcW: bottomProject.width,
      bottomSrcH: bottomProject.height,
      topFrame,
      bottomFrame,
      ratio: Math.max(0.2, Math.min(0.8, Number(ratio) || 0.5)),
      topMuted: Boolean(top.muted),
      bottomMuted: Boolean(bottom.muted),
      topVolume: Number(top.volume ?? 1),
      bottomVolume: Number(bottom.volume ?? 1),
      fps: Number(fps) === 30 ? 30 : 60,
      cues: [],
      style,
      watermark,
      hasAudio,
      onProgress: (pct) => {
        topProject.progress = { stage: 'render', pct: Math.round(pct), note: '' };
        progress(job.id, 'render', pct, '');
        emitEvent('project', { project: publicProject(topProject) });
      },
    });

    const exportRecord = {
      id: `e_${Date.now().toString(36)}`,
      file: fileName,
      clipId: null,
      title: 'Split screen',
      aspect: aspect.id,
      layout: 'splitpane',
      styleId: style.id,
      styleName: style.name,
      width,
      height,
      start: 0,
      end: Number(duration.toFixed(2)),
      duration: Number(duration.toFixed(2)),
      size: result.size,
      createdAt: new Date().toISOString(),
      url: `/api/media/exports/${topProjectId}/${encodeURIComponent(fileName)}`,
      publicPath: `/api/public/exports/${topProjectId}/${encodeURIComponent(fileName)}`,
      split: { topProjectId, bottomProjectId, ratio },
    };
    topProject.exports = [exportRecord, ...(topProject.exports || [])];
    topProject.progress = { stage: 'ready', pct: 100, note: 'Export finished' };
    await touch(topProject);
    finishJob(job.id, { exportId: exportRecord.id, file: fileName });
    return { export: exportRecord, jobId: job.id };
  } catch (error) {
    failJob(job.id, error);
    topProject.progress = { stage: 'ready', pct: 100, note: 'Render failed' };
    await touch(topProject);
    throw error;
  }
}

export async function deleteExport(projectId, exportId) {
  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found.');
  const record = (project.exports || []).find((entry) => entry.id === exportId);
  if (!record) throw new Error('Export not found.');
  await fs.rm(path.join(EXPORT_DIR, projectId, record.file), { force: true });
  project.exports = project.exports.filter((entry) => entry.id !== exportId);
  await touch(project);
  return project;
}

/** Projects interrupted by a restart should not claim to be working. */
export async function recoverStaleProjects() {
  const projects = await listProjects();
  for (const summary of projects) {
    if (summary.status !== 'downloading' && summary.status !== 'analyzing') continue;
    const project = await getProject(summary.id);
    if (!project) continue;
    project.status = project.filePath ? 'ready' : 'failed';
    project.progress = { stage: 'paused', pct: 0, note: 'Interrupted by a restart' };
    if (!project.filePath) project.error = 'The download was interrupted. Paste the link again.';
    if (project.status === 'ready' && !project.clips?.length) {
      project.status = 'failed';
      project.error = 'Analysis was interrupted. Re-run analysis to finish.';
    }
    await saveProject(project);
  }
}

export { FFMPEG, DATA_DIR, UPLOAD_DIR, EXPORT_DIR };
