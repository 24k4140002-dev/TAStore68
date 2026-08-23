import test from 'node:test';
import assert from 'node:assert/strict';

import {
  confirmOptimisticMessage,
  createOptimisticMessage,
  removeOptimisticMessage
} from '../src/services/messageState.js';

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
