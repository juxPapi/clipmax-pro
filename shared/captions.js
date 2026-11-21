// Caption catalogue, cue chunking and ASS generation. Shared by the studio
// preview (which approximates the look in CSS) and the renderer (which burns
// the same style into the exported file).

export const GROUPS = ['Signal', 'Bold Pop', 'Clean', 'Neon', 'Boxed', 'Retro', 'Karaoke'];

export const FONT_CHOICES = [
  'Arial Black',
  'Arial',
  'Impact',
  'Segoe UI',
  'Trebuchet MS',
  'Verdana',
  'Tahoma',
  'Georgia',
  'Consolas',
  'Courier New',
  'Comic Sans MS',
];

export const ASPECTS = {
  '9:16': { id: '9:16', label: '9:16 Vertical', short: 'Shorts · Reels · TikTok', width: 1080, height: 1920 },
  '4:5': { id: '4:5', label: '4:5 Portrait', short: 'Instagram feed', width: 1080, height: 1350 },
  '1:1': { id: '1:1', label: '1:1 Square', short: 'Feed · X', width: 1080, height: 1080 },
};

export const LAYOUTS = [
  { id: 'fill', label: 'Fill', hint: 'One full-frame crop' },
  { id: 'blur', label: 'Blur', hint: 'Blurred backdrop, crisp centre' },
  { id: 'split', label: 'Split', hint: 'Two stacked copies of the frame' },
  { id: 'triple', label: 'Triple', hint: 'Three stacked copies' },
];

export const LAYOUT_IDS = LAYOUTS.map((item) => item.id);

export function resolveLayout(id) {
  return LAYOUT_IDS.includes(id) ? id : LAYOUTS[0].id;
}

export const LANGUAGES = [
  { id: 'auto', label: 'Auto detect', whisper: null },
  { id: 'en', label: 'English', whisper: 'en' },
  { id: 'hi', label: 'Hindi', whisper: 'hi' },
  { id: 'ur', label: 'Urdu', whisper: 'ur' },
  { id: 'hinglish', label: 'Hinglish (mixed)', whisper: 'hi' },
  { id: 'es', label: 'Spanish', whisper: 'es' },
  { id: 'fr', label: 'French', whisper: 'fr' },
  { id: 'de', label: 'German', whisper: 'de' },
  { id: 'pt', label: 'Portuguese', whisper: 'pt' },
  { id: 'ar', label: 'Arabic', whisper: 'ar' },
  { id: 'tr', label: 'Turkish', whisper: 'tr' },
  { id: 'id', label: 'Indonesian', whisper: 'id' },
  { id: 'bn', label: 'Bengali', whisper: 'bn' },
  { id: 'ta', label: 'Tamil', whisper: 'ta' },
  { id: 'ru', label: 'Russian', whisper: 'ru' },
];

export const DEFAULT_OPTIONS = {
  wordsPerCue: 4,
  position: 'bottom',
  size: 1,
  opacity: 1,
  boxOpacity: null,
  uppercase: null,
  highlight: null,
  accent: null,
  color: null,
  font: null,
  layout: 'fill',
};

function s(group, name, o = {}) {
  return {
    id: `${group.toLowerCase().replace(/[^a-z]+/g, '-')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    group,
    name,
    font: 'Arial Black',
    color: '#FFFFFF',
    accent: '#F2C14E',
    outline: '#0A0507',
    outlineWidth: 4,
    shadow: 2,
    box: null,
    boxOpacity: 0.9,
    uppercase: true,
    italic: false,
    tilt: 0,
    animate: 'pop',
    highlight: 'word',
    wordsPerCue: 4,
    position: 'bottom',
    ...o,
  };
}

export const CAPTION_STYLES = [
  // ------------------------------------------------------------------- Signal
  s('Signal', 'Gold Rush', { accent: '#F2C14E', outlineWidth: 5, shadow: 4 }),
  s('Signal', 'Ember', { accent: '#E4572E', outlineWidth: 5, shadow: 4 }),
  s('Signal', 'Bone Cut', { accent: '#F2C14E', color: '#F5EEE3', outline: '#1E0A12', outlineWidth: 6, shadow: 3 }),
  s('Signal', 'Night Gold', { font: 'Impact', accent: '#FFC94D', outlineWidth: 4, shadow: 6 }),
  s('Signal', 'Ticket', { color: '#12070C', accent: '#E4572E', box: '#F2C14E', boxOpacity: 0.96, outlineWidth: 0, shadow: 0 }),
  s('Signal', 'Duotone', { color: '#F5EEE3', accent: '#E4572E', outlineWidth: 5 }),
  s('Signal', 'Spotlight', { accent: '#FFD98A', shadow: 8, outlineWidth: 3 }),
  s('Signal', 'Broadcast Gold', { font: 'Arial', box: '#0A0507', boxOpacity: 0.62, accent: '#F2C14E', outlineWidth: 1, shadow: 0, wordsPerCue: 6 }),

  // ----------------------------------------------------------------- Bold Pop
  s('Bold Pop', 'Coral Pop', { accent: '#FF5A47', outlineWidth: 3 }),
  s('Bold Pop', 'Lemon Punch', { accent: '#FFE14D', color: '#111111', outline: '#FFFFFF', outlineWidth: 2 }),
  s('Bold Pop', 'Mint Snap', { accent: '#38E8A6', outlineWidth: 3 }),
  s('Bold Pop', 'Sky Pop', { accent: '#4CC9F0', outlineWidth: 3 }),
  s('Bold Pop', 'Grape Soda', { accent: '#A66CFF', outlineWidth: 3, shadow: 3 }),
  s('Bold Pop', 'Tangerine', { accent: '#FF9F1C', outlineWidth: 3 }),
  s('Bold Pop', 'Cherry Bomb', { accent: '#FF3B5C', outlineWidth: 4 }),
  s('Bold Pop', 'Electric Lime', { accent: '#C6FF00', outlineWidth: 3, tilt: -2 }),

  // --------------------------------------------------------------------- Clean
  s('Clean', 'Paper White', { font: 'Segoe UI', uppercase: false, outlineWidth: 0, shadow: 1, accent: '#FFFFFF' }),
  s('Clean', 'Ink', { font: 'Segoe UI', color: '#111111', accent: '#E4572E', uppercase: false, shadow: 0, box: '#FFFFFF', boxOpacity: 0.94, outlineWidth: 0 }),
  s('Clean', 'Soft Grey', { font: 'Arial', color: '#F5F5F5', accent: '#B9B9B9', uppercase: false, shadow: 2, outlineWidth: 0 }),
  s('Clean', 'Serif Calm', { font: 'Georgia', accent: '#EADFC8', uppercase: false, shadow: 2, animate: 'fade', outlineWidth: 0 }),
  s('Clean', 'Cloud', { font: 'Segoe UI', color: '#20303C', accent: '#0A84FF', uppercase: false, box: '#F4FAFF', boxOpacity: 0.92, outlineWidth: 0 }),
  s('Clean', 'Mono Cut', { font: 'Consolas', uppercase: false, shadow: 2, accent: '#9AE6B4', outlineWidth: 0, wordsPerCue: 5 }),
  s('Clean', 'Slate', { font: 'Tahoma', color: '#E8EEF5', accent: '#7AA2FF', uppercase: false, box: '#0E1622', boxOpacity: 0.84, outlineWidth: 0 }),
  s('Clean', 'Editorial', { font: 'Georgia', uppercase: false, shadow: 0, box: '#000000', boxOpacity: 0.72, accent: '#FFFFFF', outlineWidth: 0, wordsPerCue: 7 }),

  // ---------------------------------------------------------------------- Neon
  s('Neon', 'Cyber Cyan', { accent: '#00FFF0', color: '#EAFBFF', outline: '#003A3A', outlineWidth: 3, shadow: 6, font: 'Impact' }),
  s('Neon', 'Hot Pink', { accent: '#FF2DAA', color: '#FFE9F6', outline: '#3D0022', outlineWidth: 3, shadow: 6, font: 'Impact' }),
  s('Neon', 'Acid', { accent: '#B4FF39', color: '#F4FFE0', outline: '#173300', outlineWidth: 3, shadow: 5, font: 'Impact' }),
  s('Neon', 'Ultraviolet', { accent: '#B14BFF', color: '#F3E9FF', outline: '#20003D', outlineWidth: 3, shadow: 6, font: 'Impact' }),
  s('Neon', 'Arcade', { accent: '#FFE24B', color: '#FFFDEB', outline: '#332600', outlineWidth: 3, shadow: 5, font: 'Impact', tilt: -2 }),
  s('Neon', 'Laser Red', { accent: '#FF3B3B', color: '#FFEDED', outline: '#330000', outlineWidth: 3, shadow: 6, font: 'Impact' }),
  s('Neon', 'Toxic', { accent: '#39FF88', color: '#EEFFF5', outline: '#003318', outlineWidth: 3, shadow: 5, font: 'Impact' }),
  s('Neon', 'Retrowave', { accent: '#FFD166', color: '#FFF6E0', outline: '#3A2400', outlineWidth: 3, shadow: 6, font: 'Impact', tilt: 1 }),

  // --------------------------------------------------------------------- Boxed
  s('Boxed', 'Black Bar', { font: 'Arial', uppercase: false, box: '#000000', boxOpacity: 0.86, accent: '#F2C14E', outlineWidth: 0, shadow: 0, wordsPerCue: 6 }),
  s('Boxed', 'White Slab', { font: 'Arial Black', color: '#111111', box: '#FFFFFF', boxOpacity: 0.95, accent: '#E4572E', outlineWidth: 0, shadow: 0 }),
  s('Boxed', 'Highlight Pen', { font: 'Arial', color: '#111111', box: '#F2C14E', boxOpacity: 0.95, accent: '#111111', outlineWidth: 0, shadow: 0 }),
  s('Boxed', 'Red Corner', { font: 'Arial Black', box: '#E02424', boxOpacity: 0.92, accent: '#FFFFFF', outlineWidth: 0, shadow: 0 }),
  s('Boxed', 'Mint Bar', { font: 'Arial Black', color: '#04231A', box: '#7CFFC4', boxOpacity: 0.92, accent: '#04231A', outlineWidth: 0, shadow: 0 }),
  s('Boxed', 'Blue Tag', { font: 'Trebuchet MS', box: '#1B4DFF', boxOpacity: 0.9, accent: '#F2C14E', outlineWidth: 0, shadow: 0 }),
  s('Boxed', 'News Ticker', { font: 'Arial', box: '#111111', boxOpacity: 0.94, accent: '#FF3B3B', uppercase: false, outlineWidth: 0, shadow: 0, wordsPerCue: 8 }),
  s('Boxed', 'Caption Card', { font: 'Segoe UI', color: '#0B1B26', box: '#EAF7FF', boxOpacity: 0.94, accent: '#0077CC', uppercase: false, outlineWidth: 0, shadow: 0, wordsPerCue: 7 }),

  // --------------------------------------------------------------------- Retro
  s('Retro', 'Varsity', { font: 'Impact', color: '#FFF3D6', outline: '#7A1F1F', outlineWidth: 4, shadow: 2, tilt: -2 }),
  s('Retro', 'Poster', { font: 'Georgia', color: '#2B1B0E', box: '#F2E3C6', boxOpacity: 0.94, accent: '#9C2B00', uppercase: false, outlineWidth: 0, shadow: 0 }),
  s('Retro', 'Arcade Cabinet', { font: 'Consolas', color: '#FFE24B', outline: '#3B2A00', outlineWidth: 2, shadow: 4 }),
  s('Retro', 'Sepia', { font: 'Georgia', color: '#F6E7C9', accent: '#E0A458', uppercase: false, shadow: 3, outlineWidth: 1 }),
  s('Retro', 'Typewriter', { font: 'Courier New', color: '#111111', box: '#EFE7D3', boxOpacity: 0.94, accent: '#8B0000', uppercase: false, outlineWidth: 0, shadow: 0, wordsPerCue: 6 }),
  s('Retro', 'Disco', { font: 'Impact', accent: '#FFD166', color: '#FFFFFF', outline: '#2B1B4D', outlineWidth: 3, shadow: 5, tilt: 2 }),
  s('Retro', 'Comic', { font: 'Comic Sans MS', color: '#FFFFFF', outline: '#000000', outlineWidth: 4, accent: '#FFE14D' }),
  s('Retro', 'Motel', { font: 'Impact', color: '#FF5A47', outline: '#FFFFFF', outlineWidth: 3, shadow: 3 }),

  // ------------------------------------------------------------------- Karaoke
  s('Karaoke', 'Sing Along', { accent: '#F2C14E', color: '#4A4A4A', outline: '#000000', outlineWidth: 2 }),
  s('Karaoke', 'Pop Line', { accent: '#FF5A47', color: '#FFFFFF', shadow: 2, highlight: 'line' }),
  s('Karaoke', 'Wave', { font: 'Segoe UI', accent: '#4CC9F0', color: '#F0FBFF', uppercase: false, shadow: 2, outlineWidth: 1 }),
  s('Karaoke', 'Highlight Blue', { accent: '#3B82FF', color: '#FFFFFF', box: '#000000', boxOpacity: 0.6, outlineWidth: 0, shadow: 0 }),
  s('Karaoke', 'Golden', { font: 'Georgia', accent: '#FFC94D', color: '#FFF6DA', uppercase: false, shadow: 3, outlineWidth: 1 }),
  s('Karaoke', 'Bright Word', { font: 'Trebuchet MS', accent: '#C6FF00', color: '#FFFFFF', outline: '#111111', outlineWidth: 2 }),
  s('Karaoke', 'Duet', { accent: '#A66CFF', color: '#FFFFFF', shadow: 3 }),
  s('Karaoke', 'Pulse', { font: 'Impact', accent: '#00E5B0', color: '#FFFFFF', shadow: 4 }),
];

export const DEFAULT_STYLE_ID = 'signal-gold-rush';

export function stylesByGroup() {
  return GROUPS.map((group) => ({ group, styles: CAPTION_STYLES.filter((st) => st.group === group) }));
}

export function getStyle(id) {
  return CAPTION_STYLES.find((st) => st.id === id) || CAPTION_STYLES[0];
}

export function resolveStyle(id, options = {}) {
  const base = getStyle(id);
  const out = { ...base };
  for (const key of [
    'font',
    'color',
    'accent',
    'outline',
    'uppercase',
    'tilt',
    'highlight',
    'position',
    'animate',
    'box',
  ]) {
    if (options[key] !== null && options[key] !== undefined && options[key] !== '') out[key] = options[key];
  }
  if (options.opacity !== undefined && options.opacity !== null) out.opacity = Number(options.opacity);
  if (options.size !== undefined && options.size !== null) out.size = Number(options.size);
  if (options.wordsPerCue !== undefined && options.wordsPerCue !== null) out.wordsPerCue = Number(options.wordsPerCue);
  if (options.boxOpacity !== undefined && options.boxOpacity !== null && out.box) {
    out.boxOpacity = Number(options.boxOpacity);
  }
  return out;
}

// ------------------------------------------------------------------ helpers

function hexToAss(hex, alpha = 0) {
  const clean = String(hex || '#FFFFFF').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0').slice(0, 6);
  const r = full.slice(0, 2);
  const g = full.slice(2, 4);
  const b = full.slice(4, 6);
  return `&H${Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase()}${b}${g}${r}&`.toUpperCase();
}

function assTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.round((s - Math.floor(s)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(Math.min(cs, 99)).padStart(2, '0')}`;
}

function escapeAss(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, ' ');
}

function wrapWords(words, maxCharsPerLine) {
  const lines = [[]];
  let len = 0;
  for (const word of words) {
    const add = (len ? 1 : 0) + word.text.length;
    if (len + add > maxCharsPerLine && lines[lines.length - 1].length) {
      lines.push([]);
      len = 0;
    }
    lines[lines.length - 1].push(word);
    len += (len ? 1 : 0) + word.text.length;
  }
  return lines;
}

/** Group word timings into caption cues of readable length. */
export function toCues(words, opts = {}) {
  const maxWords = opts.maxWords ?? 4;
  const maxChars = opts.maxChars ?? 24;
  const cues = [];
  let cur = null;
  const push = () => {
    if (cur && cur.words.length) cues.push({ start: cur.start, end: cur.end, words: cur.words });
    cur = null;
  };
  for (const raw of words || []) {
    const text = String(raw.text || '').trim();
    if (!text) continue;
    const word = { start: Number(raw.start) || 0, end: Number(raw.end) || Number(raw.start) || 0, text };
    if (cur) {
      const gap = word.start - cur.end;
      const prev = cur.words[cur.words.length - 1];
      const wouldBeLong = cur.words.length >= maxWords;
      const wouldBeWide = cur.chars + 1 + text.length > maxChars;
      const sentenceEnd = /[.!?…]$/.test(prev.text);
      const tooLong = word.end - cur.start > 3.6;
      if (gap > 0.55 || wouldBeLong || wouldBeWide || sentenceEnd || tooLong) push();
    }
    if (!cur) cur = { start: word.start, end: word.end, words: [], chars: 0 };
    cur.words.push(word);
    cur.chars += (cur.chars ? 1 : 0) + text.length;
    cur.end = word.end;
  }
  push();
  return cues;
}

/** Cue that is on screen at `time`, for the live preview. */
export function cueAt(cues, time) {
  if (!Array.isArray(cues)) return null;
  return cues.find((cue) => time >= cue.start && time <= cue.end) || null;
}

/**
 * Build the ASS document burned into an export.
 * `offset` is the clip start, so cue times arrive already clip-relative here.
 */
export function buildAss({ width, height, cues, style, watermark = null, duration = 0 }) {
  const st = style;
  const sizeScale = Number(st.size || 1);
  const fontSize = Math.round(width * 0.068 * sizeScale);
  const outline = Number(st.outlineWidth || 0) * (width / 1080);
  const shadow = Number(st.shadow || 0) * (width / 1080);
  const marginV = Math.round(height * (st.position === 'top' ? 0.14 : st.position === 'middle' ? 0.42 : 0.16));
  const alignment = st.position === 'top' ? 8 : st.position === 'middle' ? 5 : 2;
  const textColor = hexToAss(st.color, 1 - Number(st.opacity ?? 1));
  const accentColor = hexToAss(st.accent, 1 - Number(st.opacity ?? 1));
  const outlineColor = hexToAss(st.outline, Number(st.opacity ?? 1) < 0.9 ? 0.35 : 0);
  const boxColor = hexToAss(st.box || '#000000', 1 - Number(st.boxOpacity ?? 0.88));
  const borderStyle = st.box ? 3 : 1;
  const uppercase = st.uppercase ? (text) => text.toUpperCase() : (text) => text;
  const tilt = Number(st.tilt || 0);
  const maxCharsPerLine = Math.max(10, Math.floor((width * 0.84) / (fontSize * 0.62)));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${st.font},${fontSize},${textColor},${accentColor},${outlineColor},${boxColor},-1,${st.italic ? -1 : 0},0,0,100,100,0,0,${borderStyle},${outline.toFixed(1)},${shadow.toFixed(1)},${alignment},56,56,${marginV},1
`;

  const markColor = hexToAss('#F5EEE3', 0.55);
  const styles = watermark
    ? `Style: Mark,Arial,${Math.round(width * 0.026)},${markColor},${markColor},${hexToAss('#000000', 0.7)},${hexToAss('#000000', 1)},0,0,0,0,100,100,0,0,1,1.6,0,7,36,36,34,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`
    : `
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = [];
  if (watermark) {
    events.push(
      `Dialogue: 0,${assTime(0)},${assTime(Math.max(duration, 1))},Mark,,0,0,0,,${escapeAss(watermark)}`
    );
  }

  const rot = tilt ? `\\frz${tilt}` : '';
  const anim =
    st.animate === 'pop'
      ? '\\fscx86\\fscy86\\t(0,130,\\fscx100\\fscy100)'
      : st.animate === 'fade'
        ? '\\fad(160,120)'
        : '';

  for (const cue of cues) {
    const lines = wrapWords(cue.words, maxCharsPerLine);
    const start = cue.start;
    const end = cue.end;
    if (end <= 0) continue;
    const plain = lines.map((line) => line.map((w) => escapeAss(uppercase(w.text))).join(' ')).join('\\N');

    if (st.highlight === 'word' && cue.words.length > 1) {
      cue.words.forEach((word, idx) => {
        const wStart = Math.max(start, word.start);
        const wEnd = idx === cue.words.length - 1 ? end : Math.min(end, cue.words[idx + 1].start);
        if (wEnd <= wStart) return;
        const bodyLines = lines.map((line) =>
          line
            .map((w) => {
              const label = escapeAss(uppercase(w.text));
              return w === word ? `{\\c${accentColor}}${label}{\\c${textColor}}` : label;
            })
            .join(' ')
        );
        const intro = idx === 0 ? anim : '';
        events.push(
          `Dialogue: 0,${assTime(wStart)},${assTime(Math.max(wEnd, wStart + 0.05))},Cap,,0,0,0,,{${rot}${intro}}${bodyLines.join('\\N')}`
        );
      });
    } else {
      events.push(
        `Dialogue: 0,${assTime(Math.max(start, 0))},${assTime(Math.max(end, start + 0.1))},Cap,,0,0,0,,{${rot}${anim}}${plain}`
      );
    }
  }

  return `${header}${styles}${events.join('\n')}\n`;
}
