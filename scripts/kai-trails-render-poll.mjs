// Render 5 distinct facecam-split 1080p60 trail clips using job polling so
// long renders never hit the client fetch timeout.
// Usage: node scripts/kai-trails-render-poll.mjs <projectId>
import fs from 'node:fs/promises';

const BASE = 'http://127.0.0.1:8787';
const PID = process.argv[2];
if (!PID) { console.error('usage: node kai-trails-render-poll.mjs <projectId>'); process.exit(1); }

const projectUrl = `${BASE}/api/projects/${PID}`;
const jobsUrl = `${BASE}/api/jobs?projectId=${PID}`;
const getProject = async () => (await (await fetch(projectUrl)).json()).project;
const getJobs = async () => (await (await fetch(jobsUrl)).json()).jobs;

let p = await getProject();
if (!p || p.status !== 'ready') { console.error('project not ready', p?.status); process.exit(1); }

// Pick 5 high-scoring moments that barely overlap, so each is a distinct moment.
const sorted = [...(p.clips || [])].sort((a, b) => b.score - a.score);
const chosen = [];
for (const c of sorted) {
  if (chosen.length >= 5) break;
  const clashes = chosen.some((o) => {
    const overlap = Math.min(o.end, c.end) - Math.max(o.start, c.start);
    const shorter = Math.min(o.end - o.start, c.end - c.start);
    return overlap > 0 && overlap / shorter > 0.1;
  });
  if (!clashes) chosen.push(c);
}
if (chosen.length < 5) {
  for (const c of sorted) {
    if (chosen.length >= 5) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
}
console.log('selected', chosen.map((c) => `${c.id}:${c.score}@${c.start.toFixed(0)}-${c.end.toFixed(0)}`).join(', '));

const bodyFor = (clip) => ({
  clipId: clip.id,
  aspect: '9:16',
  styleId: 'signal-gold-rush',
  layout: 'facecam',
  facecam: { faceX: 0, faceY: 0.39, faceW: 0.21, faceH: 0.21, topRatio: 0.42 },
  fps: 60,
  start: clip.start,
  end: Math.min(clip.end, clip.start + 120),
  focus: 0.5,
  focusY: 0.5,
  zoom: 1,
  wordsPerCue: 4,
  position: 'bottom',
  size: 1,
});

const near = (a, b) => Math.abs(a - b) < 1;
async function exportFor(clip) {
  const proj = await getProject();
  const body = bodyFor(clip);
  const found = (proj.exports || []).find((e) =>
    e.clipId === clip.id && near(e.start, body.start) && near(e.end, body.end)
    && e.layout === 'facecam' && e.width === 1080 && e.height === 1920);
  if (found) return found;

  const started = Date.now();
  try {
    await fetch(`${BASE}/api/projects/${PID}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
  } catch { /* expected: the server keeps rendering after the client times out */ }

  const deadline = Date.now() + 40 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const jobs = await getJobs();
    const job = jobs.find((j) => j.type === 'render'
      && new Date(j.createdAt).getTime() >= started - 5000
      && j.status === 'done');
    if (job && job.result?.file) {
      const proj2 = await getProject();
      const rec = (proj2.exports || []).find((e) => e.file === job.result.file);
      if (rec) return rec;
    }
    const running = jobs.some((j) => j.type === 'render' && j.status === 'running');
    if (!running && !job) {
      // Nothing running and no matching done job — check once more for an export.
      const proj2 = await getProject();
      const again = (proj2.exports || []).find((e) =>
        e.clipId === clip.id && near(e.start, body.start) && near(e.end, body.end));
      if (again) return again;
    }
  }
  throw new Error(`render timed out for ${clip.id}`);
}

const out = [];
for (const clip of chosen) {
  try {
    const e = await exportFor(clip);
    const stat = await fs.stat(`data/exports/${PID}/${e.file}`);
    out.push({ clip, export: e, sizeMB: (stat.size / 1048576).toFixed(1) });
    console.log('ready', e.file, e.duration + 's', (stat.size / 1048576).toFixed(1) + 'MB');
  } catch (err) {
    console.error('failed', clip.id, err.message);
  }
}

const dest = 'C:/Users/Philomena Osei Bonsu/Desktop/Clipmax Pro - Kai Cenat Trails';
await fs.mkdir(dest, { recursive: true });
const lines = ['# Kai Cenat - 5 Trail Videos (facecam split, 1080x1920, 60 fps)', '',
  'Layout: Kai facecam top, GTA 6 gameplay bottom, burned-in word captions.', ''];
for (let i = 0; i < out.length; i += 1) {
  const { clip, export: e, sizeMB } = out[i];
  const cap = `${clip.title} - Kai Cenat GTA 6 #KAICENAT #GTA6 #KaicenatClips #GTA6Gameplay #Shorts`;
  const name = `trail-${i + 1}-${e.file}`;
  await fs.copyFile(`data/exports/${PID}/${e.file}`, `${dest}/${name}`);
  await fs.writeFile(`${dest}/trail-${i + 1}-${e.file.replace('.mp4', '.txt')}`, cap, 'utf8');
  lines.push(`## Trail ${i + 1} - ${name} (${e.duration}s, ${sizeMB} MB)`, '', cap, '', '');
}
await fs.writeFile(`${dest}/TRAIL-CAPTIONS.md`, lines.join('\n'), 'utf8');
console.log('copied', out.length, 'clips to', dest);
