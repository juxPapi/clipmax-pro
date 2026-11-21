import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildChatCurve, chatForRange } from '../server/chat.js';

test('buildChatCurve normalises message rate into per-bin values', () => {
  const messages = [
    { t: 0.2, text: 'hi' }, { t: 0.4, text: 'lol' }, { t: 0.6, text: 'wow' },
    { t: 4.1, text: 'one' }, { t: 8.2, text: 'late' },
  ];
  const curve = buildChatCurve(messages, 10, 2);
  assert.equal(curve.binSeconds, 2);
  assert.equal(curve.messageCount, 5);
  assert.equal(curve.values.length, 5);
  assert.ok(Math.max(...curve.values) <= 1);
  assert.ok(curve.values[0] > curve.values[4], 'early spike should exceed late bin');
});

test('chatForRange reports hype stats for a window', () => {
  const analysis = { chat: { binSeconds: 2, values: [0.1, 1, 0.8, 0.2] } };
  const stats = chatForRange(analysis, 2, 6);
  assert.ok(stats);
  assert.ok(stats.peak >= 0.8);
  assert.equal(typeof stats.average, 'number');
  assert.ok(stats.lift >= 0);
});
