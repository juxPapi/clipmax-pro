// Chat-replay parsing and hype-curve building for downloaded streams.
// Supports YouTube live-chat JSON (from yt-dlp --write-chat) and a generic
// line-based timestamp parser. No external services; everything is local.

import fs from 'node:fs/promises';
import path from 'node:path';

/** Find chat replay files written by yt-dlp next to the media file. */
export async function findChatFiles(dir, id) {
  let files = [];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.startsWith(`${id}.`) && /\.live_chat\.json(l)?$|\.chat\.(jsonl|txt)$/i.test(f))
    .map((f) => path.join(dir, f));
}

function pushMessage(messages, t, text) {
  if (!Number.isFinite(t) || t < 0 || !text) return;
  messages.push({ t, text: String(text).slice(0, 300) });
}

/** Parse YouTube live_chat JSON / JSONL into [{ t, text }]. */
async function parseYouTubeChat(file) {
  const raw = await fs.readFile(file, 'utf8');
  const messages = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const action = obj.replayChatMessageAction || obj.addChatItemAction?.item || obj;
    const renderer =
      action.liveChatTextMessageRenderer ||
      action.liveChatPaidMessageRenderer ||
      action.message?.liveChatTextMessageRenderer;
    if (!renderer) continue;
    let t = NaN;
    if (renderer.timestampUsec) t = Number(renderer.timestampUsec) / 1e6;
    else if (renderer.timestampText?.simpleText) {
      const m = /^(\d+):(\d+)(?::(\d+))?/.exec(renderer.timestampText.simpleText);
      if (m) t = m[3] ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
    }
    const runs = renderer.message?.runs;
    const text = runs ? runs.map((r) => r.text || '').join('') : renderer.message?.simpleText || '';
    pushMessage(messages, t, text);
  }
  return messages;
}

/** Parse a simple "seconds<TAB>text" chat dump. */
async function parseGenericChat(file) {
  const raw = await fs.readFile(file, 'utf8');
  const messages = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^\[?(\d+(?:\.\d+)?)\]?[\s,]+(.*)$/.exec(line);
    if (m) pushMessage(messages, Number(m[1]), m[2]);
  }
  return messages;
}

export async function loadChatMessages(files) {
  const all = [];
  for (const file of files || []) {
    try {
      const parsed = /live_chat/i.test(file) ? await parseYouTubeChat(file) : await parseGenericChat(file);
      all.push(...parsed);
    } catch {
      /* one bad chat file should not fail the pipeline */
    }
  }
  all.sort((a, b) => a.t - b.t);
  return all;
}

/** Build a normalised per-bin chat-rate curve aligned to the audio/heat bins. */
export function buildChatCurve(messages, duration, binSeconds = 2) {
  const bins = Math.max(1, Math.ceil(duration / binSeconds));
  const counts = new Float64Array(bins);
  let maxCount = 1;
  for (const msg of messages || []) {
    const bin = Math.min(bins - 1, Math.max(0, Math.floor(msg.t / binSeconds)));
    counts[bin] += 1;
    if (counts[bin] > maxCount) maxCount = counts[bin];
  }
  const values = new Float64Array(bins);
  for (let i = 0; i < bins; i += 1) values[i] = counts[i] / maxCount;
  // Smooth so single-message blips don't dominate.
  const smoothed = new Float64Array(bins);
  for (let i = 0; i < bins; i += 1) {
    const prev = values[i - 1] ?? values[i];
    const next = values[i + 1] ?? values[i];
    smoothed[i] = prev * 0.2 + values[i] * 0.6 + next * 0.2;
  }
  return {
    binSeconds,
    values: Array.from(smoothed, (v) => Number(v.toFixed(3))),
    messageCount: (messages || []).length,
  };
}

/** Chat intensity stats for a time range — used by the clip scorer. */
export function chatForRange(analysis, start, end) {
  const chat = analysis?.chat;
  if (!chat?.values?.length || !chat.binSeconds) return null;
  const from = Math.max(0, Math.floor(start / chat.binSeconds));
  const to = Math.min(chat.values.length, Math.ceil(end / chat.binSeconds));
  if (to <= from) return null;
  let sum = 0;
  let peak = 0;
  for (let i = from; i < to; i += 1) {
    const v = chat.values[i] || 0;
    sum += v;
    if (v > peak) peak = v;
  }
  return {
    average: Number((sum / (to - from)).toFixed(3)),
    peak: Number(peak.toFixed(3)),
    lift: Number(Math.max(0, peak - sum / (to - from)).toFixed(3)),
  };
}
