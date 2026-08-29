import test from 'node:test';
import assert from 'node:assert/strict';

import { runWithCrossTabSyncLock } from '../src/utils/crossTabSync.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    values
  };
}

test('cross-tab fallback skips a sync while another live lease owns it', async () => {
  const storage = createStorage({
    metapost_sync_lock_inbox: JSON.stringify({ owner: 'another-tab', expiresAt: 20_000 })
  });
  let calls = 0;

  const result = await runWithCrossTabSyncLock('inbox', () => {
    calls += 1;
    return 'ran';
  }, { navigatorLike: {}, storage, now: () => 10_000 });

  assert.equal(result, null);
  assert.equal(calls, 0);
});

test('cross-tab fallback releases its lease and never retries a failed task', async () => {
  const storage = createStorage();
  let calls = 0;

  await assert.rejects(
    runWithCrossTabSyncLock('inbox', async () => {
      calls += 1;
      throw new Error('synthetic failure');
    }, { navigatorLike: {}, storage, now: () => 10_000 }),
    /synthetic failure/
  );

  assert.equal(calls, 1);
  assert.equal(storage.getItem('metapost_sync_lock_inbox'), null);
});

test('Web Locks path runs only when the browser grants the lock', async () => {
  let calls = 0;
  const navigatorLike = {
    locks: {
      request: async (_name, options, callback) => {
        assert.equal(options.ifAvailable, true);
        return callback(null);
      }
    }
  };

  const result = await runWithCrossTabSyncLock('inbox', () => {
    calls += 1;
  }, { navigatorLike, storage: null });

  assert.equal(result, null);
  assert.equal(calls, 0);
});
