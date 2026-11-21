// In-process job registry. Long tasks report a stage and a percentage, and every
// change is broadcast so the UI can move without polling.

import crypto from 'node:crypto';
import { emitEvent } from './events.js';

const jobs = new Map();
const activeByProject = new Map();

export function createJob({ type, projectId = null, label = '', total = null }) {
  const job = {
    id: crypto.randomUUID(),
    type,
    projectId,
    label,
    status: 'running',
    stage: 'queued',
    progress: 0,
    note: '',
    total,
    error: null,
    result: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  if (projectId) activeByProject.set(projectId, job.id);
  emitEvent('job', { job });
  return job;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  emitEvent('job', { job });
  return job;
}

export function progress(id, stage, pct, note = '') {
  return updateJob(id, {
    stage,
    progress: Math.max(0, Math.min(100, Math.round(Number(pct) || 0))),
    ...(note ? { note } : {}),
  });
}

export function finishJob(id, result = null) {
  const job = jobs.get(id);
  if (!job) return null;
  updateJob(id, { status: 'done', stage: 'done', progress: 100, result });
  if (job.projectId && activeByProject.get(job.projectId) === id) activeByProject.delete(job.projectId);
  return jobs.get(id);
}

export function failJob(id, error) {
  const job = jobs.get(id);
  if (!job) return null;
  updateJob(id, { status: 'failed', stage: 'failed', error: String(error?.message || error).slice(0, 1200) });
  if (job.projectId && activeByProject.get(job.projectId) === id) activeByProject.delete(job.projectId);
  return jobs.get(id);
}

export function listJobs(projectId = null) {
  const all = [...jobs.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return projectId ? all.filter((job) => job.projectId === projectId) : all.slice(0, 40);
}

export function activeJob(projectId) {
  const id = activeByProject.get(projectId);
  return id ? jobs.get(id) || null : null;
}

export function isBusy(projectId) {
  return Boolean(activeJob(projectId));
}
