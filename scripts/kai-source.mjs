const BASE = 'http://127.0.0.1:8787';
const URL = 'https://www.youtube.com/watch?v=Kupe41kll08';
const SECTION = '0-180'; // first 3 minutes for quick test

const res = await fetch(`${BASE}/api/projects/url`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: URL, section: SECTION }),
});
if (!res.ok) { console.error('submit failed', res.status, await res.text()); process.exit(1); }
const { project } = await res.json();
console.log('submitted', project.id, 'Kai Cenat GTA 6');

const deadline = Date.now() + 25 * 60 * 1000;
let last = '';
while (Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 5000));
  const p = (await (await fetch(`${BASE}/api/projects/${project.id}`)).json()).project;
  const line = `${p.status} ${p.progress?.stage} ${p.progress?.pct}% clips=${(p.clips||[]).length}${p.error?' ERR='+p.error:''}`;
  if (line !== last) { console.log(line); last = line; }
  if (p.status === 'ready' || p.status === 'failed') {
    console.log('FINAL', p.status, 'clips', (p.clips||[]).length, 'name', p.name);
    if ((p.clips||[]).length) {
      for (const c of p.clips.slice(0,5)) console.log(`  #${c.index} score=${c.score} ${c.start}-${c.end} ${c.title}`);
    }
    process.exit(p.status === 'ready' ? 0 : 2);
  }
}
process.exit(3);
