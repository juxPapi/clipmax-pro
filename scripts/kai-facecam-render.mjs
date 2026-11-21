// Render Kai Cenat 1080p60 source with facecam split layout + captions.
import fs from 'node:fs/promises';

const BASE = 'http://127.0.0.1:8787';
const PID = 'p_1a4f7e84f0cf';

const p = (await (await fetch(`${BASE}/api/projects/${PID}`)).json()).project;
const clips = p.clips || [];
console.log('clips:', clips.map((c) => `${c.id} ${c.score} ${(c.end-c.start).toFixed(0)}s`).join(', '));

const out = [];
for (const clip of clips) {
  const res = await fetch(`${BASE}/api/projects/${PID}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clipId: clip.id,
      aspect: '9:16',
      styleId: 'signal-gold-rush',
      layout: 'facecam',
      facecam: { faceX: 0, faceY: 0.39, faceW: 0.21, faceH: 0.21, topRatio: 0.42 },
      fps: 60,
      start: clip.start,
      end: clip.end,
      focus: 0.5,
      focusY: 0.5,
      zoom: 1,
      wordsPerCue: 4,
      position: 'bottom',
      size: 1,
    }),
  });
  if (!res.ok) {
    console.error('render failed', clip.id, res.status, (await res.text()).slice(0, 300));
    continue;
  }
  const { export: e } = await res.json();
  const stat = await fs.stat(`data/exports/${PID}/${e.file}`);
  out.push({ clip, export: e, sizeMB: (stat.size / 1048576).toFixed(1) });
  console.log('rendered', e.file, e.duration + 's', (stat.size/1048576).toFixed(1) + 'MB');
}

const dest = 'C:/Users/Philomena Osei Bonsu/Desktop/Clipmax Pro - Kai Cenat Clips';
await fs.mkdir(dest, { recursive: true });
const lines = ['# Kai Cenat Clips - Facecam Split 1080p60', '', 'Layout: streamer face on top, gameplay below, captions burned in.', ''];
for (const { clip, export: e, sizeMB } of out) {
  const cap = `${clip.title} - Kai Cenat GTA 6 #KAICENAT #GTA6 #KaicenatClips #GTA6Gameplay #Shorts`;
  await fs.copyFile(`data/exports/${PID}/${e.file}`, `${dest}/${e.file}`);
  await fs.writeFile(`${dest}/${e.file.replace('.mp4','.txt')}`, cap, 'utf8');
  lines.push(`## ${e.file} (${e.duration}s, ${sizeMB} MB)`, '', cap, '', '');
}
await fs.writeFile(`${dest}/CAPTIONS.md`, lines.join('\n'), 'utf8');
console.log('copied to', dest);
