import { test } from 'node:test';
import assert from 'node:assert/strict';

import { scoreRange, findClips } from '../server/clips.js';

function makeWords(seconds = 30) {
  const words = [];
  let t = 0;
  const pools = ['how', 'why', 'free', 'amazing', 'biggest', '5', 'mistake', 'secret'];
  while (t < seconds) {
    const duration = Math.min(0.35, seconds - t);
    const text = pools[words.length % pools.length] + (words.length % 20 === 19 ? '.' : '');
    words.push({ start: t, end: t + duration, text });
    t += duration + 0.15;
  }
  return words;
}

test('scoreRange returns a scored range over the clip', () => {
  const range = scoreRange(makeWords(), 8, 12, 'en');
  assert.ok(range);
  assert.ok(range.start >= 0 && range.end > range.start);
  assert.ok(range.score >= 22 && range.score <= 98);
  assert.ok(range.excerpt.length > 0);
  assert.ok(range.hashtags.length > 0);
});

test('findClips produces ordered, bounded scored moments from a stream', () => {
  const clips = findClips({ words: makeWords(180), duration: 180, language: 'en', limit: 5 });
  assert.ok(clips.length > 0);
  for (const clip of clips) {
    assert.ok(clip.end - clip.start >= 45 && clip.end - clip.start <= 120, 'clips must be 45-120s');
    assert.ok(clip.score >= 22 && clip.score <= 98);
    assert.ok(clip.title);
    assert.ok(Array.isArray(clip.hashtags));
  }
  for (let i = 1; i < clips.length; i += 1) {
    assert.ok(clips[i].start >= clips[i - 1].start, 'clips should be ordered by start');
    const overlap = Math.min(clips[i].end, clips[i - 1].end) - Math.max(clips[i].start, clips[i - 1].start);
    const shorter = Math.min(clips[i].end - clips[i].start, clips[i - 1].end - clips[i - 1].start);
    assert.ok(overlap / shorter <= 0.35 + 1e-9, 'clip overlap stays within the allowed 35%');
  }
});
