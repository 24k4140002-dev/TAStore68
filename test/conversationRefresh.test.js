import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeRefreshedPageConversations,
  preserveFailedPageConversations
} from '../src/services/conversationRefresh.js';

test('one failed Page does not disappear when other Pages refresh successfully', () => {
  const fresh = [{ page_id: '1', fb_conversation_id: 'new' }];
  const previous = [{ page_id: '2', fb_conversation_id: 'cached' }, { page_id: '3', fb_conversation_id: 'unselected' }];
  assert.deepEqual(preserveFailedPageConversations(fresh, previous, ['2']), [...fresh, previous[0]]);
  assert.deepEqual(preserveFailedPageConversations(fresh, previous, []), fresh);
});

test('first-page polling updates fresh rows and preserves older loaded conversations', () => {
  const previous = [
    { page_id: '1', fb_conversation_id: 'same', snippet: 'old' },
    { page_id: '1', fb_conversation_id: 'older', snippet: 'keep' },
    { page_id: '2', fb_conversation_id: 'other-page', snippet: 'exclude' }
  ];
  const fresh = [
    { page_id: '1', fb_conversation_id: 'same', snippet: 'new' },
    { page_id: '1', fb_conversation_id: 'latest', snippet: 'latest' }
  ];

  assert.deepEqual(mergeRefreshedPageConversations(fresh, previous, ['1']), [
    fresh[0], fresh[1], previous[1]
  ]);
});
