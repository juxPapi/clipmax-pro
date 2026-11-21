// Monitor app health + fetch pipeline. Run with: node scripts/monitor.mjs
const BASE = 'http://127.0.0.1:8787';

async function check() {
  try {
    const h = await (await fetch(`${BASE}/api/health`)).json();
    const p = await (await fetch(`${BASE}/api/projects`)).json();
    const q = await (await fetch(`${BASE}/api/publish/queue`)).json();
    console.log(`[${new Date().toLocaleTimeString()}] health=OK ffmpeg=${h.ffmpeg} ytdlp=${String(h.ytdlp).slice(0, 10)} models=${h.modelsCached}`);
    console.log(`  projects=${p.projects.length} queue=${q.items.length}`);
    for (const x of p.projects.slice(0, 5)) {
      console.log(`  ${x.id} ${x.status} ${x.progress?.stage} ${x.progress?.pct}% clips=${x.clips}${x.error ? ' ERR=' + x.error : ''}`);
    }
  } catch (e) {
    console.log(`[${new Date().toLocaleTimeString()}] health=DOWN ${e.message}`);
  }
}

await check();
