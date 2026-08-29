import test from 'node:test';
import assert from 'node:assert/strict';
import { isStandaloneApp, shouldApplySyncToken } from '../src/utils/tokenSync.js';

test('QR sync applies a new token only once per browser storage', () => {
  assert.equal(shouldApplySyncToken('', 'EAA-new'), true);
  assert.equal(shouldApplySyncToken('EAA-old', 'EAA-new'), true);
  assert.equal(shouldApplySyncToken('EAA-same', 'EAA-same'), false);
  assert.equal(shouldApplySyncToken('EAA-old', ''), false);
});

test('detects iOS Home Screen and display-mode standalone launches', () => {
  assert.equal(isStandaloneApp({ navigator: { standalone: true } }), true);
  assert.equal(isStandaloneApp({
    navigator: {},
    matchMedia: () => ({ matches: true })
  }), true);
  assert.equal(isStandaloneApp({
    navigator: {},
    matchMedia: () => ({ matches: false })
  }), false);
});
