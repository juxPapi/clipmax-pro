// Build a picture-slide MP4 from text slides using FFmpeg (no image-gen needed).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tutorial-slides');
fs.mkdirSync(OUT, { recursive: true });

const FFMPEG = 'ffmpeg';
const W = 1280, H = 720, DUR = 4;
const fontDir = OUT;
fs.copyFileSync('C:/Windows/Fonts/impact.ttf', path.join(fontDir, 'impact.ttf'));
fs.copyFileSync('C:/Windows/Fonts/arial.ttf', path.join(fontDir, 'arial.ttf'));

const esc = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');
const IMPACT = esc(path.join(fontDir, 'impact.ttf'));
const ARIAL = esc(path.join(fontDir, 'arial.ttf'));

const slides = [
  { big: 'CLIPMAX PRO', small: 'Find the moment.' },
  { big: '01  LINK OR FILE', small: 'Paste a stream or drop a recording' },
  { big: '02  LISTEN LOCALLY', small: 'Whisper transcribes every word on your machine' },
  { big: '03  SCORE THE PEAKS', small: 'Heatmap finds the loud, word-dense moments' },
  { big: '04  CUT VERTICAL', small: 'Reframe, caption, render 9:16' },
  { big: 'POST EVERYWHERE', small: 'YouTube  |  TikTok  |  Instagram  |  Facebook' },
];

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-1000)))));
  });
}

for (let i = 0; i < slides.length; i += 1) {
  const { big, small } = slides[i];
  const textEsc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const file = path.join(OUT, `slide-${i + 1}.png`);
  // Draw each filter in a separate chain via split-free simple -vf, avoiding comma-in-path issues.
  const vf = [
    `drawbox=x=0:y=0:w=${W}:h=${H}:color=0x0D0609:t=fill`,
    `drawbox=x=0:y=${H - 8}:w=${W}:h=8:color=0xF2C14E:t=fill`,
    `drawbox=x=0:y=0:w=${W}:h=4:color=0xE4572E:t=fill`,
    `drawtext=fontfile='${IMPACT}':text='${textEsc(big)}':fontcolor=0xF5EEE3:fontsize=84:x=(w-text_w)/2:y=${H / 2 - 80}`,
    `drawtext=fontfile='${ARIAL}':text='${textEsc(small)}':fontcolor=0xF2C14E:fontsize=30:x=(w-text_w)/2:y=${H / 2 + 40}`,
    `drawtext=fontfile='${ARIAL}':text='CLIPMAX PRO - LOCAL-FIRST CLIPPER STUDIO':fontcolor=0x6F5F58:fontsize=18:x=(w-text_w)/2:y=${H - 70}`,
  ].join(',');
  await run(['-y', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=1`, '-vf', vf, '-frames:v', '1', file]);
  console.log('made', path.basename(file));
}

const listFile = path.join(OUT, 'slides.txt');
const slidePaths = slides.map((_, i) => path.join(OUT, `slide-${i + 1}.png`).replace(/\\/g, '/'));
fs.writeFileSync(listFile, slidePaths.map((p) => `file '${p}'\nduration ${DUR}\n`).join('') + `file '${slidePaths[slidePaths.length - 1]}'\n`);
const outVideo = path.join(ROOT, 'Clipmax-Pro-Tutorial.mp4');
await run([
  '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
  '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
  '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
  '-movflags', '+faststart', outVideo,
]);
console.log('VIDEO:', outVideo, `${(fs.statSync(outVideo).size / 1048576).toFixed(2)} MB`);
