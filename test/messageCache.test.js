import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MESSAGE_CACHE_INDEX_KEY,
  persistMessageCache,
  readMessageCache,
  setCacheItemWithMessageEviction,
  trimMessagesForCache
} from '../src/services/messageCache.js';

class MemoryStorage {
  constructor(quota = Infinity) {
    this.values = new Map();
    this.quota = quota;
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    const next = new Map(this.values);
    next.set(String(key), String(value));
    const size = [...next.entries()].reduce((total, [entryKey, entryValue]) => (
      total + entryKey.length + entryValue.length
    ), 0);
    if (size > this.quota) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.values = next;
  }

  removeItem(key) {
    this.values.delete(String(key));
  }
}

test('message snapshots keep only the newest bounded window', () => {
  const messages = Array.from({ length: 100 }, (_, index) => ({ id: `mid_${index}` }));
  const trimmed = trimMessagesForCache(messages, 60);

  assert.equal(trimmed.length, 60);
  assert.equal(trimmed[0].id, 'mid_40');
  assert.equal(trimmed.at(-1).id, 'mid_99');
});

test('message cache keeps a bounded number of recoverable conversations', () => {
  const storage = new MemoryStorage();
  const options = { persistentStorage: storage, sessionStorageLike: null, maxConversations: 2 };

  persistMessageCache('conv_1', [{ id: 'mid_1' }], { ...options, now: 1 });
  persistMessageCache('conv_2', [{ id: 'mid_2' }], { ...options, now: 2 });
  persistMessageCache('conv_3', [{ id: 'mid_3' }], { ...options, now: 3 });

  assert.equal(storage.getItem('metapost_msgs_conv_1'), null);
  assert.deepEqual(readMessageCache('conv_2', options), [{ id: 'mid_2' }]);
  assert.deepEqual(readMessageCache('conv_3', options), [{ id: 'mid_3' }]);
});

test('quota pressure evicts an older message snapshot instead of throwing', () => {
  const storage = new MemoryStorage(340);
  storage.values.set('metapost_msgs_old_1', JSON.stringify([{ id: 'x'.repeat(90) }]));
  storage.values.set('metapost_msgs_old_2', JSON.stringify([{ id: 'y'.repeat(90) }]));
  storage.values.set(MESSAGE_CACHE_INDEX_KEY, JSON.stringify({ old_1: 1, old_2: 2 }));

  const result = persistMessageCache('current', [{ id: 'z'.repeat(90) }], {
    persistentStorage: storage,
    sessionStorageLike: null,
    maxConversations: 24,
    now: 3
  });

  assert.equal(result.persistent, true);
  assert.deepEqual(readMessageCache('current', {
    persistentStorage: storage,
    sessionStorageLike: null
  }), [{ id: 'z'.repeat(90) }]);
  assert.ok(storage.getItem('metapost_msgs_old_1') === null || storage.getItem('metapost_msgs_old_2') === null);
});

test('a fresh Inbox snapshot can reclaim old message cache quota safely', () => {
  const storage = new MemoryStorage(300);
  storage.values.set('metapost_msgs_old_1', JSON.stringify([{ id: 'x'.repeat(90) }]));
  storage.values.set('metapost_msgs_old_2', JSON.stringify([{ id: 'y'.repeat(90) }]));
  storage.values.set(MESSAGE_CACHE_INDEX_KEY, JSON.stringify({ old_1: 1, old_2: 2 }));

  const saved = setCacheItemWithMessageEviction(
    storage,
    'metapost_inbox_cache_page_1',
    JSON.stringify([{ id: 'conversation_1', snippet: 'z'.repeat(80) }])
  );

  assert.equal(saved, true);
  assert.match(storage.getItem('metapost_inbox_cache_page_1'), /conversation_1/);
});
