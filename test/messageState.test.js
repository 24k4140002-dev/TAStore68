import test from 'node:test';
import assert from 'node:assert/strict';

import {
  confirmOptimisticMessage,
  createOptimisticMessage,
  isConversationRequestCurrent,
  mergeMessageWindow,
  removeOptimisticMessage
} from '../src/services/messageState.js';

test('an older history response cannot update a newly selected conversation', () => {
  assert.equal(isConversationRequestCurrent({
    activeConversationId: 'conv_B',
    conversationId: 'conv_A',
    currentRequestId: 8,
    requestId: 7
  }), false);
  assert.equal(isConversationRequestCurrent({
    activeConversationId: 'conv_A',
    conversationId: 'conv_A',
    currentRequestId: 7,
    requestId: 7
  }), true);
});

test('confirms only the matching optimistic Messenger message', () => {
  const optimistic = createOptimisticMessage({
    id: 'temp_1',
    text: 'Xin chào',
    createdAt: '2026-08-24T00:00:00.000Z',
    pageId: 'page_1',
    pageName: 'Page thử nghiệm'
  });
  const otherPending = { ...optimistic, id: 'temp_2', message: 'Tin khác' };

  const result = confirmOptimisticMessage(
    [optimistic, otherPending],
    'temp_1',
    { message_id: 'mid_1' }
  );

  assert.deepEqual(result[0], {
    ...optimistic,
    id: 'mid_1',
    sending: false
  });
  assert.deepEqual(result[1], otherPending);
});

test('removes only the failed optimistic message', () => {
  const messages = [
    { id: 'existing' },
    { id: 'temp_failed', sending: true },
    { id: 'temp_other', sending: true }
  ];

  assert.deepEqual(removeOptimisticMessage(messages, 'temp_failed'), [
    { id: 'existing' },
    { id: 'temp_other', sending: true }
  ]);
});

test('merges a small latest-message window without dropping older history', () => {
  const existing = [
    { id: 'old_1', created_time: '2026-08-23T23:00:00.000Z' },
    { id: 'shared', message: 'stale', created_time: '2026-08-24T00:00:00.000Z' }
  ];
  const latest = [
    { id: 'shared', message: 'fresh', created_time: '2026-08-24T00:00:00.000Z' },
    { id: 'new_1', created_time: '2026-08-24T01:00:00.000Z' }
  ];

  assert.deepEqual(mergeMessageWindow(existing, latest), [
    existing[0],
    latest[0],
    latest[1]
  ]);
});
