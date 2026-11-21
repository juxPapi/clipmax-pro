// Publish queue and scheduler. One item can fan out to four platforms; each
// target reports independently, so a TikTok failure does not hide a YouTube win.

import crypto from 'node:crypto';
import path from 'node:path';
import { EXPORT_DIR, getProject, getQueue, saveQueue, upsertQueueItem, removeQueueItem, getSettings } from '../store.js';
import { CONNECTORS, TARGETS } from './connectors.js';
import { emitEvent } from '../events.js';

let running = false;
let timer = null;

const KNOWN = new Set(TARGETS.map((target) => target.id));

function emitQueue() {
  getQueue()
    .then((queue) => emitEvent('queue', { items: queue.items }))
    .catch(() => {});
}

export async function enqueuePost({
  projectId,
  exportId,
  targets,
  scheduleAt = null,
  title = null,
  description = null,
  hashtags = null,
}) {
  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found.');
  const exportRecord = (project.exports || []).find((entry) => entry.id === exportId);
  if (!exportRecord) throw new Error('Render a clip before queueing it.');
  const list = [...new Set((targets || []).filter((target) => KNOWN.has(target)))];
  if (!list.length) throw new Error('Pick at least one platform.');

  const clip = (project.clips || []).find((entry) => entry.id === exportRecord.clipId);
  const when = scheduleAt ? new Date(scheduleAt) : new Date();
  if (Number.isNaN(when.getTime())) throw new Error('That schedule time is not a valid date.');

  const item = {
    id: `q_${crypto.randomBytes(5).toString('hex')}`,
    projectId,
    exportId,
    clipId: exportRecord.clipId,
    title: String(title || clip?.title || exportRecord.title || project.name).slice(0, 100),
    description: String(description ?? clip?.excerpt ?? '').slice(0, 2400),
    hashtags: Array.isArray(hashtags) ? hashtags.slice(0, 12) : clip?.hashtags || [],
    targets: list,
    scheduleAt: when.toISOString(),
    status: 'scheduled',
    results: {},
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    file: exportRecord.file,
    aspect: exportRecord.aspect,
  };
  await upsertQueueItem(item);
  emitQueue();
  kickQueue();
  return item;
}

export async function listQueue() {
  const queue = await getQueue();
  return queue.items;
}

export async function cancelItem(id) {
  const queue = await getQueue();
  const item = queue.items.find((entry) => entry.id === id);
  if (!item) throw new Error('Queue item not found.');
  if (item.status === 'running') throw new Error('That item is already posting. Wait for it to finish.');
  await removeQueueItem(id);
  emitQueue();
  return { ok: true };
}

export async function retryItem(id) {
  const queue = await getQueue();
  const item = queue.items.find((entry) => entry.id === id);
  if (!item) throw new Error('Queue item not found.');
  item.status = 'scheduled';
  item.results = {};
  item.scheduleAt = new Date().toISOString();
  item.startedAt = null;
  item.finishedAt = null;
  await upsertQueueItem(item);
  emitQueue();
  kickQueue();
  return item;
}

async function runItem(item) {
  const settings = await getSettings();
  const project = await getProject(item.projectId);
  const exportRecord = (project?.exports || []).find((entry) => entry.id === item.exportId);
  if (!project || !exportRecord) {
    item.status = 'failed';
    item.finishedAt = new Date().toISOString();
    item.results = { _: { ok: false, error: 'The source project or export no longer exists.' } };
    await upsertQueueItem(item);
    return;
  }
  const filePath = path.join(EXPORT_DIR, item.projectId, exportRecord.file);
  item.status = 'running';
  item.startedAt = new Date().toISOString();
  await upsertQueueItem(item);
  emitQueue();

  for (const target of item.targets) {
    const connector = CONNECTORS[target];
    try {
      if (!connector) throw new Error('Unknown platform.');
      if (settings.dryRun) {
        item.results[target] = {
          ok: true,
          simulated: true,
          id: `dry-${Date.now().toString(36)}`,
          note: 'Dry run: nothing was posted. Turn off dry run in Settings when you are ready.',
        };
      } else {
        const result = await connector({
          filePath,
          title: item.title,
          description: item.description,
          hashtags: item.hashtags,
          settings,
          publicPath: exportRecord.publicPath,
        });
        item.results[target] = { ...result, at: new Date().toISOString() };
      }
    } catch (error) {
      item.results[target] = { ok: false, error: String(error?.message || error).slice(0, 800) };
    }
    await upsertQueueItem(item);
    emitQueue();
  }

  const values = Object.values(item.results);
  const successes = values.filter((result) => result.ok).length;
  item.status = successes === values.length ? 'done' : successes > 0 ? 'partial' : 'failed';
  item.finishedAt = new Date().toISOString();
  await upsertQueueItem(item);
  emitQueue();
}

/** Process everything that is due. Runs one item at a time. */
export async function kickQueue() {
  if (running) return;
  running = true;
  try {
    const queue = await getQueue();
    const now = Date.now();
    const due = queue.items
      .filter((item) => item.status === 'scheduled' && new Date(item.scheduleAt).getTime() <= now + 1000)
      .sort((a, b) => String(a.scheduleAt).localeCompare(String(b.scheduleAt)));
    for (const item of due) {
      // Re-read in case a cancel removed it while this loop was waiting.
      const fresh = (await getQueue()).items.find((entry) => entry.id === item.id);
      if (!fresh || fresh.status !== 'scheduled') continue;
      await runItem(fresh);
    }
  } finally {
    running = false;
  }
}

export function startScheduler(intervalMs = 20_000) {
  if (timer) return timer;
  timer = setInterval(() => {
    kickQueue().catch(() => {});
  }, intervalMs);
  timer.unref?.();
  kickQueue().catch(() => {});
  return timer;
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
