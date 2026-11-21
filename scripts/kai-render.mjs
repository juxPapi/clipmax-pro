// Render top Kai Cenat clips to 9:16 captioned MP4s and write posting captions.
import fs from 'node:fs/promises';

const BASE = 'http://127.0.0.1:8787';
const PID = 'p_53a5b8762a47';

const p = (await (await fetch(`${BASE}/api/projects/${PID}`)).json()).project;
const clips = [...(p.clips || [])].sort((a, b) => b.score - a.score).slice(0, 4);
console.log('rendering', clips.length, 'clips');

const rows = [];
for (const clip of clips) {
  const res = await fetch(`${BASE}/api/projects/${PID}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clipId: clip.id,
      aspect: '9:16',
      styleId: 'signal-gold-rush',
      layout: 'fill',
      focus: 0.5,
      focusY: 0.5,
      zoom: 1,
      start: clip.start,
      end: clip.end,
      wordsPerCue: 4,
      position: 'bottom',
      size: 1,
    }),
  });
  if (!res.ok) {
    console.error('render failed', clip.id, res.status, (await res.text()).slice(0, 200));
    continue;
  }
  const { export: e } = await res.json();
  const caption = `${clip.title} — Kai Cenat going crazy in GTA 6 😭 #KAICENAT #GTA6 #KaicenatClips #GTA6Gameplay #Shorts`;
  const localPath = `data/exports/${PID}/${e.file}`;
  const stat = await fs.stat(localPath);
  rows.push({
    clip: clip.id,
    score: clip.score,
    duration: e.duration,
    sizeMB: (stat.size / 1048576).toFixed(1),
    file: e.file,
    url: `${BASE}${e.url}`,
    caption,
  });
  console.log(`  ${clip.id}: ${e.duration}s ${(stat.size/1048576).toFixed(1)}MB`);
}

await fs.writeFile('KAI-CENAT-POSTS.md', `# Kai Cenat Campaign — Ready to Post\n\nCampaign: Kai Cenat - $10,000 GTA 6 Pool Campaign (Clipped & Shipped)\nSource: "I Tried Escaping 6 Stars In GTA 6..." (Kai Cenat Gaming, uploaded 2026-11-19)\n\nRules reminder: caption must mention "Kai Cenat" and use #KAICENAT. Post to TikTok / IG Reels / YouTube Shorts / X. No logos in video. Clip must feature Kai Cenat as primary focus.\n\n${rows.map((r, i) => `## Clip ${i + 1} — ${r.clip} (score ${r.score})\n- File: \`${r.file}\` (${r.duration}s, ${r.sizeMB} MB)\n- Local URL: ${r.url}\n- Caption:\n  \`\`\`\n  ${r.caption}\n  \`\`\`\n`).join('\n')}\n`);
console.log('Wrote KAI-CENAT-POSTS.md with', rows.length, 'clips');
