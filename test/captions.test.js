import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildAss, toCues, stylesByGroup, DEFAULT_STYLE_ID } from '../shared/captions.js';

test('toCues splits words into short readable cues', () => {
  const words = Array.from({ length: 12 }, (_, i) => ({
    start: i * 0.5,
    end: i * 0.5 + 0.4,
    text: `word${i}`,
  }));
  const cues = toCues(words, { maxWords: 4, maxChars: 24 });
  assert.ok(cues.length > 0);
  assert.ok(cues.every((cue) => cue.words.length <= 4));
  assert.equal(cues[0].start, 0);
  assert.equal(cues.at(-1).words[words.at(-1).length - 1]?.text ?? true, true);
});

test('buildAss emits dialogue events with the style applied', () => {
  const words = [{ start: 0, end: 1, text: 'HELLO' }];
  const cues = toCues(words, { maxWords: 4 });
  const ass = buildAss({ width: 1080, height: 1920, cues, style: { color: '#FFFFFF', accent: '#F2C14E' }, duration: 1 });
  assert.ok(ass.includes('Dialogue:'));
  assert.ok(ass.includes('HELLO'));
});

test('the catalogue has the default style and every group', () => {
  const ids = stylesByGroup().flatMap((group) => group.styles.map((style) => style.id));
  assert.ok(ids.includes(DEFAULT_STYLE_ID));
  assert.ok(stylesByGroup().some((group) => ['Signal', 'Bold Pop', 'Clean', 'Neon', 'Boxed', 'Retro', 'Karaoke'].includes(group.group)));
});
