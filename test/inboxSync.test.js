import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createSyncQueue, normalizePushSignal, matchesActiveThread } from '../src/services/inboxSync.js';
import { mergeRefreshedPageConversations } from '../src/services/conversationRefresh.js';

function clock() {
  let time = 0, nextId = 0;
  const timers = new Map();
  return {
    timers,
    now: () => time,
    setTimer(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    async tick() {
      const [id, timer] = [...timers].sort((a,b) => a[1].at - b[1].at)[0] || [];
      if (!timer) return;
      timers.delete(id); time = timer.at; await timer.fn();
    }
  };
}

test('Push identity accepts old workers and targets the correct Page/customer', () => {
  const c = { page_id: '1', fb_conversation_id: 'chat-a', customer_psid: '123' };
  const old = normalizePushSignal({ type: 'PUSH_DELIVERED', pageId: '1' });
  assert.equal(matchesActiveThread(old, c), true);
  assert.equal(matchesActiveThread({ ...old, pageId: '2' }, c), false);
  assert.equal(matchesActiveThread({ ...old, senderPsid: '456' }, c), false);
  assert.equal(matchesActiveThread({ ...old, senderPsid: '123' }, c), true);
  assert.equal(matchesActiveThread({ ...old, convId: 'chat-b' }, c), false);
  assert.equal(normalizePushSignal({ type: 'PUSH_DELIVERED', pageId: 'all' }), null);
});

test('refresh burst is coalesced and an event received in flight gets one trailing run', async () => {
  const c = clock();
  let count = 0, resolve;
  const queue = createSyncQueue(async () => {
    count++;
    if (count === 1) await new Promise(r => { resolve = r; });
  }, c);
  queue.request(); queue.request(); queue.request();
  assert.equal(c.timers.size, 1);
  const inFlight = c.tick();
  assert.equal(count, 1);
  queue.request(); queue.request();
  assert.equal(c.timers.size, 0);
  resolve(); await inFlight;
  assert.equal(c.timers.size, 1);
  await c.tick();
  assert.equal(count, 2);
  assert.equal(c.now(), 1200);
});

test('disposed refresh queue cannot rerun an old chat after a switch', async () => {
  const c = clock();
  let count = 0, resolve;
  const queue = createSyncQueue(async () => { count++; await new Promise(r => { resolve = r; }); }, c);
  queue.request(); const pending = c.tick();
  queue.request(); queue.dispose(); resolve(); await pending;
  queue.request(); await c.tick();
  assert.equal(count, 1);
  assert.equal(c.timers.size, 0);
});

test('a failed refresh is reported and does not block the next refresh', async () => {
  const c = clock(); let errors = 0, runs = 0;
  const queue = createSyncQueue(async () => { if (++runs === 1) throw Error('synthetic'); }, { ...c, onError: () => errors++ });
  queue.request(); await c.tick(); queue.request(); await c.tick();
  assert.equal(errors, 1); assert.equal(runs, 2);
});

test('a targeted Page refresh in all-Pages view preserves other Pages and old history', () => {
  const previous = [{ page_id:'1', fb_conversation_id:'a', snippet:'old' }, { page_id:'2', fb_conversation_id:'b' }];
  const fresh = [{ ...previous[0], snippet:'new' }];
  const result = mergeRefreshedPageConversations(fresh, previous, ['1', '2']);
  assert.equal(result.length, 2); assert.equal(result[0].snippet, 'new');
  assert.deepEqual(result[1], previous[1]);
});

test('service worker forwards Page/customer/message identity after notification display', async () => {
  const handlers = {}, forwarded = [];
  let notification;
  const context = vm.createContext({ self: {
    addEventListener(type, handler) { handlers[type] = handler; },
    registration: { async showNotification(title, options) { notification = { title, options }; } },
    clients: { async matchAll() { return [{ postMessage(data) { forwarded.push(data); } }]; } }
  } });
  vm.runInContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  let promise;
  handlers.push({ data: { json: () => ({ title:'Synthetic Page', data:{ pageId:'1', senderPsid:'123', messageId:'mid1' } }) }, waitUntil(p) { promise = p; } });
  await promise;
  assert.equal(notification.title, 'Synthetic Page');
  assert.equal(forwarded[0].pageId, '1'); assert.equal(forwarded[0].senderPsid, '123');
  assert.equal(forwarded[0].messageId, 'mid1');
  assert.equal(normalizePushSignal(forwarded[0]).messageId, 'mid1');
});

test('Inbox integration guards late responses and listens for Push on both chat and list', async () => {
  const source = await readFile(new URL('../src/components/inbox/CRMInbox.jsx', import.meta.url), 'utf8');
  const poll = source.slice(source.indexOf('// Push wakes only'), source.indexOf('// Meta labels are refreshed'));
  assert.match(poll, /if \(!isCurrent\(requestId\)\) return/);
  assert.match(poll, /setMessages\(prev => isCurrent\(requestId\)/);
  assert.equal((poll.match(/addEventListener\(INBOX_PUSH_EVENT/g) || []).length, 2);
  assert.match(poll, /partial: true/);
  assert.match(poll, /setMessageLoadError/);
  assert.doesNotMatch(source, /subscribeAllPagesWebhooks\(fetchedPages\)/);
});
