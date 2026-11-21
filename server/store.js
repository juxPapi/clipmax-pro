// Local data store. Everything lives under ./data so the app is portable and
// nothing leaves the machine unless a publish target is explicitly enabled.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const EXPORT_DIR = path.join(DATA_DIR, 'exports');
export const PROJECT_DIR = path.join(DATA_DIR, 'projects');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const MODEL_DIR = path.join(DATA_DIR, 'models');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');

export const DEFAULT_SETTINGS = {
  dryRun: true,
  defaults: {
    aspect: '9:16',
    captionStyle: 'signal-gold-rush',
    layout: 'fill',
    model: 'base',
    language: 'auto',
    wordsPerCue: 4,
  },
  brand: {
    handle: '',
    watermark: false,
  },
  platforms: {
    youtube: { clientId: '', clientSecret: '', refreshToken: '', privacy: 'public' },
    tiktok: { clientKey: '', clientSecret: '', accessToken: '', privacy: 'PUBLIC_TO_EVERYONE' },
    instagram: { accessToken: '', igUserId: '', publicBaseUrl: '' },
    facebook: { pageId: '', accessToken: '' },
  },
};

const cache = new Map();
let settingsCache = null;
let queueCache = null;

for (const dir of [UPLOAD_DIR, EXPORT_DIR, PROJECT_DIR, TMP_DIR, MODEL_DIR]) {
  await fs.mkdir(dir, { recursive: true });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDeep(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch === undefined ? base : patch;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = mergeDeep(base?.[key] ?? {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export function projectPath(id) {
  return path.join(PROJECT_DIR, `${id}.json`);
}

export async function getProject(id) {
  if (cache.has(id)) return cache.get(id);
  try {
    const project = JSON.parse(await fs.readFile(projectPath(id), 'utf8'));
    cache.set(id, project);
    return project;
  } catch {
    return null;
  }
}

export async function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  cache.set(project.id, project);
  await writeJson(projectPath(project.id), project);
  return project;
}

export async function listProjects() {
  const files = await fs.readdir(PROJECT_DIR).catch(() => []);
  const projects = [];
  for (const file of files) {
    if (!file.endsWith('.json') || file.endsWith('.tmp')) continue;
    try {
      const project = JSON.parse(await fs.readFile(path.join(PROJECT_DIR, file), 'utf8'));
      projects.push({
        id: project.id,
        name: project.name,
        source: project.source || null,
        duration: project.duration,
        width: project.width,
        height: project.height,
        status: project.status,
        progress: project.progress || null,
        clips: project.clips?.length || 0,
        topScore: project.clips?.reduce((max, clip) => Math.max(max, clip.score || 0), 0) || 0,
        exports: project.exports?.length || 0,
        language: project.language || 'auto',
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        thumb: `/api/projects/${project.id}/thumb`,
      });
    } catch {
      /* skip a half-written file */
    }
  }
  return projects.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function deleteProject(id) {
  const project = await getProject(id);
  cache.delete(id);
  await fs.rm(projectPath(id), { force: true });
  if (project) {
    if (project.filePath) await fs.rm(project.filePath, { force: true });
    await fs.rm(path.join(UPLOAD_DIR, `${id}.preview.mp4`), { force: true });
    await fs.rm(path.join(UPLOAD_DIR, `${id}.jpg`), { force: true });
    await fs.rm(path.join(TMP_DIR, `${id}.wav`), { force: true });
    await fs.rm(path.join(EXPORT_DIR, id), { recursive: true, force: true });
  }
  return project;
}

// ------------------------------------------------------------------ settings

export async function getSettings() {
  if (settingsCache) return settingsCache;
  try {
    const raw = JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8'));
    settingsCache = mergeDeep(clone(DEFAULT_SETTINGS), raw);
  } catch {
    settingsCache = clone(DEFAULT_SETTINGS);
  }
  return settingsCache;
}

export async function saveSettings(patch) {
  const current = await getSettings();
  settingsCache = mergeDeep(clone(current), patch);
  await writeJson(SETTINGS_FILE, settingsCache);
  return settingsCache;
}

/** Settings with secrets replaced by flags, safe to send to the renderer. */
export async function publicSettings() {
  const settings = await getSettings();
  const p = settings.platforms;
  const platforms = {
    youtube: {
      configured: Boolean(p.youtube.clientId && p.youtube.clientSecret && p.youtube.refreshToken),
      privacy: p.youtube.privacy,
    },
    tiktok: {
      configured: Boolean(p.tiktok.accessToken),
      privacy: p.tiktok.privacy,
    },
    instagram: {
      configured: Boolean(p.instagram.accessToken && p.instagram.igUserId),
      igUserId: p.instagram.igUserId || '',
      publicBaseUrl: p.instagram.publicBaseUrl || '',
    },
    facebook: {
      configured: Boolean(p.facebook.pageId && p.facebook.accessToken),
      pageId: p.facebook.pageId || '',
    },
  };
  return {
    dryRun: settings.dryRun,
    defaults: settings.defaults,
    brand: settings.brand,
    platforms,
  };
}

// --------------------------------------------------------------------- queue

function defaultQueue() {
  return { items: [] };
}

export async function getQueue() {
  if (queueCache) return queueCache;
  try {
    queueCache = JSON.parse(await fs.readFile(QUEUE_FILE, 'utf8'));
    if (!Array.isArray(queueCache.items)) queueCache = defaultQueue();
  } catch {
    queueCache = defaultQueue();
  }
  return queueCache;
}

export async function saveQueue(queue) {
  queueCache = queue;
  await writeJson(QUEUE_FILE, queue);
  return queue;
}

export async function upsertQueueItem(item) {
  const queue = await getQueue();
  const index = queue.items.findIndex((entry) => entry.id === item.id);
  if (index >= 0) queue.items[index] = item;
  else queue.items.unshift(item);
  queue.items = queue.items.slice(0, 300);
  await saveQueue(queue);
  return item;
}

export async function removeQueueItem(id) {
  const queue = await getQueue();
  queue.items = queue.items.filter((entry) => entry.id !== id);
  await saveQueue(queue);
}

export async function listExports(projectId) {
  const dir = path.join(EXPORT_DIR, projectId);
  const files = await fs.readdir(dir).catch(() => []);
  const out = [];
  for (const file of files) {
    if (!file.endsWith('.mp4') || file.endsWith('-with-outro.mp4')) continue;
    const stat = await fs.stat(path.join(dir, file)).catch(() => null);
    if (!stat) continue;
    out.push({
      file,
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
      url: `/api/media/exports/${projectId}/${encodeURIComponent(file)}`,
      publicPath: `/api/public/exports/${projectId}/${encodeURIComponent(file)}`,
    });
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
