// HTTP surface for the desktop app: projects, pipeline, media, settings,
// publishing and a single SSE stream for progress.

import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  TMP_DIR,
  UPLOAD_DIR,
  EXPORT_DIR,
  publicSettings,
  getSettings,
  saveSettings,
  getProject,
  listProjects,
  deleteProject,
  listExports,
  getQueue,
  saveQueue,
} from './store.js';
import { bus } from './events.js';
import { FFMPEG, version as ffmpegVersion } from './media.js';
import { ytDlpVersion, isProbablyUrl } from './ingest.js';
import { MODELS, modelStatus } from './asr.js';
import {
  publicProject,
  startFileProject,
  startUrlProject,
  reanalyzeProject,
  renderClipJob,
  deleteExport,
  recoverStaleProjects,
} from './pipeline.js';
import { listJobs, activeJob } from './jobs.js';
import { enqueuePost, listQueue, cancelItem, retryItem, startScheduler, kickQueue } from './publish/queue.js';
import { TARGETS } from './publish/connectors.js';
import {
  ASPECTS,
  CAPTION_STYLES,
  LANGUAGES,
  LAYOUTS,
  DEFAULT_STYLE_ID,
  stylesByGroup,
} from '../shared/captions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 8787;

const upload = multer({
  storage: multer.diskStorage({
    destination: TMP_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname) || '.mp4'}`),
  }),
  limits: { fileSize: 4 * 1024 * 1024 * 1024 },
});

function asString(value, max = 2000) {
  return String(value ?? '').slice(0, max);
}

export function createApp({ serveBuild = false } = {}) {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', async (req, res) => {
    const [ffmpeg, ytdlp, models, settings] = await Promise.all([
      ffmpegVersion(),
      ytDlpVersion(),
      modelStatus(),
      getSettings(),
    ]);
    res.json({
      ok: true,
      node: process.version,
      ffmpeg,
      ffmpegPath: FFMPEG,
      ytdlp,
      modelsCached: models,
      chrome: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      ].find((candidate) => existsSync(candidate)) || null,
      dryRun: settings.dryRun,
      dataDir: ROOT,
    });
  });

  app.get('/api/bootstrap', async (req, res, next) => {
    try {
      const [settings, projects, queue, jobs] = await Promise.all([
        publicSettings(),
        listProjects(),
        listQueue(),
        listJobs(),
      ]);
      res.json({
        settings,
        projects,
        queue,
        jobs,
        targets: TARGETS,
        styles: stylesByGroup(),
        defaultStyle: DEFAULT_STYLE_ID,
        styleCount: CAPTION_STYLES.length,
        aspects: ASPECTS,
        layouts: LAYOUTS,
        languages: LANGUAGES,
        models: MODELS,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/styles', (req, res) => {
    res.json({ groups: stylesByGroup(), defaultStyle: DEFAULT_STYLE_ID, count: CAPTION_STYLES.length });
  });

  // ---------------------------------------------------------------- projects

  app.get('/api/projects', async (req, res, next) => {
    try {
      res.json({ projects: await listProjects() });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id', async (req, res, next) => {
    try {
      const project = await getProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      const active = activeJob(project.id);
      res.json({
        project: publicProject(project),
        jobs: listJobs(project.id),
        activeJob: active,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/upload', upload.single('video'), async (req, res, next) => {
    const tempPath = req.file?.path;
    try {
      if (!req.file) return res.status(400).json({ error: 'No video file arrived.' });
      const project = await startFileProject({
        tempPath,
        originalName: req.file.originalname,
        size: req.file.size,
      });
      res.status(201).json({ project: publicProject(project) });
    } catch (error) {
      if (tempPath) await fs.rm(tempPath, { force: true }).catch(() => {});
      next(error);
    }
  });

  app.post('/api/projects/url', async (req, res, next) => {
    try {
      const url = asString(req.body?.url).trim();
      if (!isProbablyUrl(url)) {
        return res.status(400).json({ error: 'Paste a full http(s) link to a stream, VOD or clip.' });
      }
      const project = await startUrlProject(url);
      res.status(201).json({ project: publicProject(project) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/analyze', async (req, res, next) => {
    try {
      const project = await getProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      if (activeJob(project.id)) return res.status(409).json({ error: 'That project is already working.' });
      const next0 = await reanalyzeProject(project.id, {
        model: req.body?.model ? String(req.body.model) : undefined,
        language: req.body?.language ? String(req.body.language) : undefined,
      });
      res.status(202).json({ project: publicProject(next0) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/projects/:id', async (req, res, next) => {
    try {
      const project = await getProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found.' });
      await deleteProject(project.id);
      const queue = await getQueue();
      queue.items = queue.items.filter((item) => item.projectId !== project.id);
      await saveQueue(queue);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/exports', async (req, res, next) => {
    try {
      res.json({ exports: await listExports(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/render', async (req, res, next) => {
    try {
      const result = await renderClipJob(req.params.id, String(req.body?.clipId || ''), req.body || {});
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/projects/:id/exports/:exportId', async (req, res, next) => {
    try {
      const project = await deleteExport(req.params.id, req.params.exportId);
      res.json({ project: publicProject(project) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/thumb', async (req, res, next) => {
    try {
      const project = await getProject(req.params.id);
      if (!project?.thumbPath || !existsSync(project.thumbPath)) {
        return res.status(404).end();
      }
      res.sendFile(project.thumbPath);
    } catch (error) {
      next(error);
    }
  });

  // ------------------------------------------------------------------- media

  app.get('/api/media/source/:id', async (req, res, next) => {
    try {
      const project = await getProject(req.params.id);
      if (!project?.filePath || !existsSync(project.filePath)) return res.status(404).end();
      res.sendFile(project.filePath);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/media/playback/:id', async (req, res, next) => {
    try {
      const project = await getProject(req.params.id);
      if (!project?.playbackPath || !existsSync(project.playbackPath)) return res.status(404).end();
      res.sendFile(project.playbackPath);
    } catch (error) {
      next(error);
    }
  });

  function sendExport(req, res) {
    const projectId = path.basename(req.params.projectId);
    const file = path.basename(req.params.file);
    const target = path.join(EXPORT_DIR, projectId, file);
    if (!target.startsWith(EXPORT_DIR) || !existsSync(target)) return res.status(404).end();
    res.sendFile(target);
  }

  app.get('/api/media/exports/:projectId/:file', sendExport);
  // Instagram fetches reels from a URL, so exports are also reachable here.
  // Nothing is exposed beyond this folder, and only if you start a tunnel.
  app.get('/api/public/exports/:projectId/:file', sendExport);

  // ----------------------------------------------------------------- publish

  app.get('/api/publish/targets', (req, res) => res.json({ targets: TARGETS }));

  app.get('/api/publish/queue', async (req, res, next) => {
    try {
      res.json({ items: await listQueue() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/publish', async (req, res, next) => {
    try {
      const item = await enqueuePost({
        projectId: asString(req.body?.projectId, 80),
        exportId: asString(req.body?.exportId, 80),
        targets: Array.isArray(req.body?.targets) ? req.body.targets.map((value) => String(value)) : [],
        scheduleAt: req.body?.scheduleAt || null,
        title: req.body?.title ? asString(req.body.title, 200) : null,
        description: req.body?.description ? asString(req.body.description, 2400) : null,
        hashtags: Array.isArray(req.body?.hashtags) ? req.body.hashtags.map((tag) => String(tag)).slice(0, 12) : null,
      });
      res.status(201).json({ item });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/publish/:id/retry', async (req, res, next) => {
    try {
      res.json({ item: await retryItem(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/publish/:id', async (req, res, next) => {
    try {
      res.json(await cancelItem(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  // ----------------------------------------------------------------- settings

  app.get('/api/settings', async (req, res, next) => {
    try {
      res.json({ settings: await publicSettings() });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/settings', async (req, res, next) => {
    try {
      const allowed = {};
      for (const key of ['dryRun', 'defaults', 'brand', 'platforms']) {
        if (req.body?.[key] !== undefined) allowed[key] = req.body[key];
      }
      await saveSettings(allowed);
      res.json({ settings: await publicSettings() });
    } catch (error) {
      next(error);
    }
  });

  // -------------------------------------------------------------------- jobs

  app.get('/api/jobs', (req, res) => res.json({ jobs: listJobs(req.query.projectId || null) }));

  // -------------------------------------------------------------------- feed

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`data: ${JSON.stringify({ type: 'hello', at: new Date().toISOString() })}\n\n`);
    const listener = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    bus.on('event', listener);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      bus.off('event', listener);
    });
  });

  // ------------------------------------------------------------- static build
  if (serveBuild) {
    const dist = path.join(ROOT, 'dist');
    if (existsSync(dist)) {
      app.use(express.static(dist, { index: false }));
      app.get('*', (req, res) => {
        if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
        res.sendFile(path.join(dist, 'index.html'));
      });
    }
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    const status = error?.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
    const message =
      error?.code === 'LIMIT_FILE_SIZE'
        ? 'That file is larger than the 4 GB upload limit.'
        : String(error?.message || error);
    res.status(status).json({ error: message });
  });

  return app;
}

export async function startServer({ port = PORT, serveBuild = false } = {}) {
  await recoverStaleProjects();
  startScheduler();
  const app = createApp({ serveBuild });
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      kickQueue().catch(() => {});
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
    server.on('error', async (error) => {
      if (error.code === 'EADDRINUSE') {
        resolve({ server: null, url: `http://127.0.0.1:${port}`, reused: true });
      } else {
        throw error;
      }
    });
  });
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const serveBuild = process.argv.includes('--serve-build') || process.env.SERVE_BUILD === '1';
  startServer({ serveBuild }).then(({ url }) => {
    console.log(`Clipmax Pro API ready on ${url}`);
    // Keep the process alive (the HTTP server should do this, but on some
    // Node versions the event loop drains after the listen callback).
    setInterval(() => {}, 1 << 30);
  }).catch((err) => {
    console.error('startServer failed:', err);
    process.exit(1);
  });
}
