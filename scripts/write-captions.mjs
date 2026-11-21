// Write per-clip caption files (SRT + posting text) beside the Desktop videos.
import fs from 'node:fs/promises';

const BASE = 'http://127.0.0.1:8787';
const PID = 'p_53a5b8762a47';
const DEST = 'C:/Users/Philomena Osei Bonsu/Desktop/Clipmax Pro - Kai Cenat Clips';

const p = (await (await fetch(`${BASE}/api/projects/${PID}`)).json()).project;
const map = {
  'clip-1-4-9x16-mwqum7hx.mp4': 'clip-1-4',
  'clip-8-97-9x16-mwqunvgn.mp4': 'clip-8-97',
  'clip-4-45-9x16-mwqurkfa.mp4': 'clip-4-45',
  'clip-5-58-9x16-mwqusf47.mp4': 'clip-5-58',
};

function srtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

for (const [file, clipId] of Object.entries(map)) {
  const clip = p.clips.find((c) => c.id === clipId);
  if (!clip) continue;
  const base = file.replace(/\.mp4$/, '');
  const caption = `${clip.title} - Kai Cenat going crazy in GTA 6 #KAICENAT #GTA6 #KaicenatClips #GTA6Gameplay #Shorts`;
  await fs.writeFile(`${DEST}/${base}.txt`, caption, 'utf8');
  const srt = (clip.words || [])
    .map((w, i) => `${i + 1}\n${srtTime(w.start)} --> ${srtTime(w.end)}\n${w.text}\n`)
    .join('\n');
  await fs.writeFile(`${DEST}/${base}.srt`, srt, 'utf8');
  console.log('wrote captions for', base);
}
