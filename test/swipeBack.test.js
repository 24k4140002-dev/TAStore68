import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canStartMobileSwipeBack,
  getMobileSwipeBackOffset,
  shouldCompleteMobileSwipeBack
} from '../src/utils/swipeBack.js';

test('mobile back swipe starts only with one finger near the left edge', () => {
  assert.equal(canStartMobileSwipeBack({ startX: 20, viewportWidth: 360 }), true);
  assert.equal(canStartMobileSwipeBack({ startX: 80, viewportWidth: 360 }), false);
  assert.equal(canStartMobileSwipeBack({ startX: 20, viewportWidth: 1024 }), false);
  assert.equal(canStartMobileSwipeBack({ startX: 20, viewportWidth: 360, touchCount: 2 }), false);
});

test('mobile back swipe ignores vertical scrolling and leftward movement', () => {
  assert.equal(getMobileSwipeBackOffset({ x: 12, y: 100 }, { x: 8, y: 100 }), 0);
  assert.equal(getMobileSwipeBackOffset({ x: 12, y: 100 }, { x: 42, y: 150 }), 0);
  assert.equal(getMobileSwipeBackOffset({ x: 12, y: 100 }, { x: 82, y: 110 }), 70);
});

test('mobile back swipe completes only after a clear rightward gesture', () => {
  assert.equal(shouldCompleteMobileSwipeBack({ x: 12, y: 100 }, { x: 90, y: 112 }), true);
  assert.equal(shouldCompleteMobileSwipeBack({ x: 12, y: 100 }, { x: 70, y: 105 }), false);
  assert.equal(shouldCompleteMobileSwipeBack({ x: 12, y: 100 }, { x: 90, y: 180 }), false);
});
