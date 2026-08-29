import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPushHealth,
  PUSH_PAGE_SELECTION_CHANGED_EVENT,
  PUSH_REGISTRATION_COOLDOWN_MS,
  shouldRefreshPushRegistration,
  shouldUseServerPush
} from '../src/services/pushState.js';

test('Page selection changes use one shared Push refresh event name', () => {
  assert.equal(PUSH_PAGE_SELECTION_CHANGED_EVENT, 'metapost-push-page-selection-changed');
});

test('a push for one Page never silences another Page', () => {
  const input = { enabled: true, permission: 'granted', pageId: '1', receivedPages: { '1': 1000 }, now: 2000 };
  assert.equal(shouldUseServerPush(input), true);
  assert.equal(shouldUseServerPush({ ...input, pageId: '2' }), false);
  assert.equal(shouldUseServerPush({ ...input, enabled: false }), false);
  assert.equal(shouldUseServerPush({ ...input, permission: 'denied' }), false);
  assert.equal(shouldUseServerPush({ ...input, now: 1000 + 86400000 }), false);
});

test('a partial setup cannot be marked healthy by an observed webhook', () => {
  assert.equal(getPushHealth({ failedCount: 1, received: true }), 'partial');
  assert.equal(getPushHealth({ callbackReady: false, received: true }), 'partial');
  assert.equal(getPushHealth({ received: false }), 'waiting');
});

test('startup reuses a recent matching Push registration but refreshes stale or changed Pages', () => {
  const now = Date.parse('2026-08-29T00:00:00Z');
  const input = {
    enabled: true,
    permission: 'granted',
    hasSubscription: true,
    lastRegisteredAt: now - 60_000,
    storedSelectionSignature: 'selected:1,2',
    currentSelectionSignature: 'selected:1,2',
    now
  };
  assert.equal(shouldRefreshPushRegistration(input), false);
  assert.equal(shouldRefreshPushRegistration({ ...input, currentSelectionSignature: 'selected:1,3' }), true);
  assert.equal(shouldRefreshPushRegistration({ ...input, hasSubscription: false }), true);
  assert.equal(shouldRefreshPushRegistration({
    ...input,
    lastRegisteredAt: now - PUSH_REGISTRATION_COOLDOWN_MS
  }), true);
});
