// Adopt the downloaded 720p60 HLS section as a project through the upload API.
import fs from 'node:fs/promises';

const BASE = 'http://127.0.0.1:8787';
const file = 'C:/Users/Philomena Osei Bonsu/Documents/faceless/data/tmp/hls720.mp4';
const buf = await fs.readFile(file);
const form = new FormData();
form.append('video', new Blob([buf], { type: 'video/mp4' }), 'Kai-Cenat-GTA6-720p60.mp4');
const up = await fetch(`${BASE}/api/projects/upload`, { method: 'POST', body: form });
if (!up.ok) { console.error('upload failed', up.status, await up.text()); process.exit(1); }
const { project } = await up.json();
console.log('uploaded', project.id);

const deadline = Date.now() + 25 * 60 * 1000;
let last = '';
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 5000));
  const p = (await (await fetch(`${BASE}/api/projects/${project.id}`)).json()).project;
  const line = `${p.status} ${p.progress?.stage} ${p.progress?.pct}% clips=${(p.clips||[]).length}${p.error?' ERR='+p.error:''}`;
  if (line !== last) { console.log(line); last = line; }
  if (p.status === 'ready' || p.status === 'failed') {
    console.log('FINAL', p.status, 'clips', (p.clips||[]).length, 'name', p.name);
    if ((p.clips||[]).length) for (const c of p.clips.slice(0,8)) console.log(`  #${c.index} ${c.score} ${c.start.toFixed(1)}-${c.end.toFixed(1)} (${(c.end-c.start).toFixed(0)}s) ${c.title}`);
    process.exit(p.status === 'ready' ? 0 : 2);
  }
}
process.exit(3);
