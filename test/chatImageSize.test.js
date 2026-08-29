import test from 'node:test';
import assert from 'node:assert/strict';
import { getChatImageSize } from '../src/utils/chatImageSize.js';

test('chat image reserves scaled portrait and landscape frames before loading', () => {
  assert.deepEqual(getChatImageSize({ width: 1200, height: 2400 }), { width: 144, height: 288 });
  assert.deepEqual(getChatImageSize({ width: 2400, height: 1200 }), { width: 280, height: 140 });
  assert.deepEqual(getChatImageSize({ width: 100, height: 50 }), { width: 100, height: 50 });
  assert.deepEqual(getChatImageSize({ width: 0, height: NaN }), { width: 240, height: 240 });
});
