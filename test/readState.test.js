import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyConfirmedReadsToConversations,
  applyConfirmedReadsToSummary,
  collectConfirmedReadCandidates,
  createReadCandidate,
  filterCurrentReadCandidates,
  persistConfirmedReadsToInboxCaches
} from '../src/services/readState.js';

function conversation(overrides = {}) {
  return {
    fb_conversation_id: 'conv_A',
    page_id: 'page_A',
    last_message_id: 'mid_A1',
    last_message_at: '2026-08-28T00:00:00Z',
    unread_count: 1,
    ...overrides
  };
}

test('a newly arrived message is never cleared by an older Meta read confirmation', () => {
  const candidate = createReadCandidate(conversation());
  const current = [conversation({ last_message_id: 'mid_A2', unread_count: 1 })];
  const stillCurrent = filterCurrentReadCandidates(current, [candidate]);

  assert.deepEqual(stillCurrent, []);
  assert.equal(applyConfirmedReadsToConversations(current, stillCurrent)[0].unread_count, 1);
});

test('confirmed loaded reads clear only their Page and preserve other Page counters', () => {
  const candidate = createReadCandidate(conversation());
  const settled = [{ status: 'fulfilled', value: { confirmed: true } }];
  const confirmed = collectConfirmedReadCandidates([candidate], settled);
  const current = [conversation(), conversation({
    fb_conversation_id: 'conv_B',
    page_id: 'page_B',
    last_message_id: 'mid_B1'
  })];
  const applicable = filterCurrentReadCandidates(current, confirmed);
  const next = applyConfirmedReadsToConversations(current, applicable);
  const summary = applyConfirmedReadsToSummary({
    total: 8,
    perPage: [
      { pageId: 'page_A', unreadCount: 1 },
      { pageId: 'page_B', unreadCount: 7 }
    ]
  }, applicable);

  assert.equal(next[0].unread_count, 0);
  assert.equal(next[1].unread_count, 1);
  assert.equal(summary.total, 7);
  assert.equal(summary.perPage[0].unreadCount, 0);
  assert.equal(summary.perPage[1].unreadCount, 7);
});

test('a rejected or unconfirmed Meta request never clears the local unread badge', () => {
  const candidate = createReadCandidate(conversation());
  assert.deepEqual(collectConfirmedReadCandidates([candidate], [
    { status: 'fulfilled', value: { confirmed: false } }
  ]), []);
  assert.deepEqual(collectConfirmedReadCandidates([candidate], [
    { status: 'rejected', reason: new Error('Synthetic rejection') }
  ]), []);
});

test('confirmed reads are persisted to every Inbox cache but never clear a newer message', () => {
  const values = new Map([
    ['metapost_inbox_cache', JSON.stringify([conversation()])],
    ['metapost_inbox_cache_page_A', JSON.stringify([
      conversation(),
      conversation({ fb_conversation_id: 'conv_B', last_message_id: 'mid_B1' })
    ])],
    ['metapost_inbox_cache_page_B', JSON.stringify([
      conversation({ last_message_id: 'mid_A2' })
    ])],
    ['unrelated', JSON.stringify([conversation()])]
  ]);
  const storage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] || null,
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };

  const updated = persistConfirmedReadsToInboxCaches(storage, [createReadCandidate(conversation())]);

  assert.equal(updated, 2);
  assert.equal(JSON.parse(values.get('metapost_inbox_cache'))[0].unread_count, 0);
  assert.equal(JSON.parse(values.get('metapost_inbox_cache_page_A'))[0].read_sync_state, 'confirmed');
  assert.equal(JSON.parse(values.get('metapost_inbox_cache_page_B'))[0].unread_count, 1);
  assert.equal(JSON.parse(values.get('unrelated'))[0].unread_count, 1);
});
