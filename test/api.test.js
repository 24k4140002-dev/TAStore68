import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import webpush from 'web-push';

import exchangeToken from '../api/meta/exchange-token.js';
import customLabels from '../api/meta/custom-labels.js';
import webhook from '../api/webhook.js';
import pushConfig from '../api/push/config.js';
import pushSubscribe from '../api/push/subscribe.js';
import pushUnsubscribe from '../api/push/unsubscribe.js';
import pushStatus from '../api/push/status.js';
import {
  buildPushReadyPayload,
  ensureAppWebhookSubscription,
  ensurePageWebhookSubscriptions,
  hashPushEndpoint,
  isValidPushEndpoint, isValidPushSubscription, selectNotificationPages, verifyPushApp, getWebhookDiagnostics,
  sendPageMessagePush
} from '../api/_lib/push.js';

const originalFetch = globalThis.fetch;
const originalSendNotification = webpush.sendNotification;
const originalSetVapidDetails = webpush.setVapidDetails;
const SYNTHETIC_PUSH_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/synthetic-device';
const SYNTHETIC_P256DH = 'A'.repeat(87);
const SYNTHETIC_AUTH = 'B'.repeat(22);
const originalEnv = {
  appId: process.env.META_APP_ID,
  appSecret: process.env.META_APP_SECRET,
  graphVersion: process.env.META_GRAPH_VERSION,
  verifyToken: process.env.FB_WEBHOOK_VERIFY_TOKEN
  , supabaseUrl: process.env.SUPABASE_URL
  , serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY
  , vapidPublic: process.env.WEB_PUSH_VAPID_PUBLIC_KEY
  , vapidPrivate: process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  , vapidSubject: process.env.WEB_PUSH_SUBJECT
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  webpush.sendNotification = originalSendNotification;
  webpush.setVapidDetails = originalSetVapidDetails;
  setEnv('META_APP_ID', originalEnv.appId);
  setEnv('META_APP_SECRET', originalEnv.appSecret);
  setEnv('META_GRAPH_VERSION', originalEnv.graphVersion);
  setEnv('FB_WEBHOOK_VERIFY_TOKEN', originalEnv.verifyToken);
  setEnv('SUPABASE_URL', originalEnv.supabaseUrl);
  setEnv('SUPABASE_SERVICE_ROLE_KEY', originalEnv.serviceRole);
  setEnv('WEB_PUSH_VAPID_PUBLIC_KEY', originalEnv.vapidPublic);
  setEnv('WEB_PUSH_VAPID_PRIVATE_KEY', originalEnv.vapidPrivate);
  setEnv('WEB_PUSH_SUBJECT', originalEnv.vapidSubject);
});

function setEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test('token exchange rejects unsupported methods without exposing CORS', async () => {
  const response = await exchangeToken.fetch(new Request('https://example.com/api/meta/exchange-token'));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
});

test('token exchange fails safely when server credentials are missing', async () => {
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;

  const response = await exchangeToken.fetch(new Request(
    'https://example.com/api/meta/exchange-token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com' },
      body: JSON.stringify({ shortToken: 'EAA-synthetic-token' })
    }
  ));

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /chưa cấu hình/);
});

test('token exchange keeps app credentials on the server and uses v26', async () => {
  process.env.META_APP_ID = 'synthetic-app-id';
  process.env.META_APP_SECRET = 'synthetic-app-secret';
  process.env.META_GRAPH_VERSION = 'v26.0';

  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      access_token: 'EAA-long-lived-synthetic',
      token_type: 'bearer',
      expires_in: 3600
    });
  };

  const response = await exchangeToken.fetch(new Request(
    'https://example.com/api/meta/exchange-token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com' },
      body: JSON.stringify({
        shortToken: 'EAA-short-synthetic',
        appSecret: 'must-be-ignored'
      })
    }
  ));

  assert.equal(response.status, 200);
  assert.match(requestedUrl, /graph\.facebook\.com\/v26\.0\/oauth\/access_token/);
  assert.match(requestedUrl, /client_secret=synthetic-app-secret/);
  assert.doesNotMatch(requestedUrl, /must-be-ignored/);
});

test('token exchange rejects an oversized body even without content-length', async () => {
  process.env.META_APP_ID = 'synthetic-app-id';
  process.env.META_APP_SECRET = 'synthetic-app-secret';

  const response = await exchangeToken.fetch(new Request(
    'https://example.com/api/meta/exchange-token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com' },
      body: JSON.stringify({ shortToken: `EAA${'x'.repeat(17000)}` })
    }
  ));

  assert.equal(response.status, 413);
});

test('custom label proxy forwards only allowlisted operations without putting tokens in URLs', async () => {
  let upstream = null;
  globalThis.fetch = async (url, options = {}) => {
    upstream = { url: String(url), options };
    return Response.json({ data: [{ id: '123', page_label_name: 'Đã đặt hàng' }] });
  };

  const response = await customLabels.fetch(new Request(
    'https://example.com/api/meta/custom-labels',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com' },
      body: JSON.stringify({
        operation: 'list_page_labels',
        pageId: '110129951561478',
        pageToken: 'synthetic-page-token'
      })
    }
  ));

  assert.equal(response.status, 200);
  assert.match(upstream.url, /\/110129951561478\/custom_labels/);
  assert.doesNotMatch(upstream.url, /synthetic-page-token/);
  assert.equal(upstream.options.headers.Authorization, 'Bearer synthetic-page-token');
});

test('custom label proxy rejects arbitrary Graph paths and invalid Meta IDs', async () => {
  const response = await customLabels.fetch(new Request(
    'https://example.com/api/meta/custom-labels',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com' },
      body: JSON.stringify({
        operation: 'delete_everything',
        pageId: '../me',
        pageToken: 'synthetic-page-token'
      })
    }
  ));

  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /không được hỗ trợ/);
});

test('custom label proxy normalizes known unsupported read responses without console-flooding 400s', async () => {
  globalThis.fetch = async () => Response.json({
    error: {
      message: 'Unsupported get request.',
      code: 100,
      error_subcode: 33,
      type: 'GraphMethodException'
    }
  }, { status: 400 });

  const response = await customLabels.fetch(new Request(
    'https://example.com/api/meta/custom-labels',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com' },
      body: JSON.stringify({
        operation: 'list_user_labels',
        userPsid: '28358125920479582',
        pageToken: 'synthetic-page-token'
      })
    }
  ));
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(data.data, []);
  assert.equal(data.unsupported, true);
  assert.equal(data.metaError.code, 100);
  assert.equal(data.metaError.error_subcode, 33);
});

test('custom label proxy still preserves mutation failures for diagnosis', async () => {
  globalThis.fetch = async () => Response.json({
    error: {
      message: 'Permission denied.',
      code: 10,
      error_subcode: 2018001,
      type: 'OAuthException'
    }
  }, { status: 400 });

  const response = await customLabels.fetch(new Request(
    'https://example.com/api/meta/custom-labels',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com' },
      body: JSON.stringify({
        operation: 'create_label',
        pageId: '110129951561478',
        labelName: 'Synthetic label',
        pageToken: 'synthetic-page-token'
      })
    }
  ));
  const data = await response.json();
  assert.equal(response.status, 400);
  assert.equal(data.error.code, 10);
  assert.equal(data.error.error_subcode, 2018001);
});

test('webhook requires configuration and validates signed raw payloads', async () => {
  process.env.META_APP_SECRET = 'synthetic-webhook-secret';
  process.env.FB_WEBHOOK_VERIFY_TOKEN = 'synthetic-verify-token';

  const challengeResponse = await webhook.fetch(new Request(
    'https://example.com/api/webhook?hub.mode=subscribe&hub.verify_token=synthetic-verify-token&hub.challenge=12345'
  ));
  assert.equal(challengeResponse.status, 200);
  assert.equal(await challengeResponse.text(), '12345');

  const rawBody = JSON.stringify({
    object: 'page',
    entry: [{ id: 'synthetic-page', messaging: [] }]
  });
  const signature = `sha256=${crypto
    .createHmac('sha256', process.env.META_APP_SECRET)
    .update(rawBody)
    .digest('hex')}`;

  const signedResponse = await webhook.fetch(new Request(
    'https://example.com/api/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature
      },
      body: rawBody
    }
  ));
  assert.equal(signedResponse.status, 200);
  assert.equal(await signedResponse.text(), 'EVENT_RECEIVED');

  const forgedResponse = await webhook.fetch(new Request(
    'https://example.com/api/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=forged'
      },
      body: rawBody
    }
  ));
  assert.equal(forgedResponse.status, 401);
});

test('push config fails closed until all private backend settings exist', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  delete process.env.WEB_PUSH_SUBJECT;
  const response = await pushConfig.fetch(new Request('https://example.com/api/push/config'));
  assert.equal(response.status, 503);
});

test('push config confirms both private tables before publishing the VAPID key', async () => {
  process.env.SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_synthetic';
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'synthetic-public';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'synthetic-private';
  process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    return Response.json([]);
  };
  const response = await pushConfig.fetch(new Request('https://example.com/api/push/config'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).publicKey, 'synthetic-public');
  assert.equal(urls.length, 2);
  assert.match(urls[0], /push_subscriptions/);
  assert.match(urls[1], /push_events/);
});

test('push subscription is scoped to Pages confirmed by Meta and never stores the user token', async () => {
  process.env.META_APP_ID = 'synthetic-app';
  process.env.SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_synthetic';
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'synthetic-public';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'synthetic-private';
  process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/app?')) return Response.json({ id: 'synthetic-app' });
    if (String(url).startsWith('https://graph.facebook.com/')) {
      return Response.json({ data: [{ id: '110129951561478', name: 'Áo Bóng Đá Huế' }] });
    }
    return new Response(null, { status: 204 });
  };
  const subscription = {
    endpoint: SYNTHETIC_PUSH_ENDPOINT,
    expirationTime: null,
    keys: { p256dh: SYNTHETIC_P256DH, auth: SYNTHETIC_AUTH }
  };
  const response = await pushSubscribe.fetch(new Request(
    'https://example.com/api/push/subscribe',
    {
      method: 'POST',
      headers: {
        origin: 'https://example.com',
        authorization: 'Bearer synthetic-facebook-user-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ subscription })
    }
  ));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).pageCount, 1);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-facebook-user-token');
  const storedBody = calls[2].options.body;
  assert.equal(calls[2].options.headers.apikey, 'sb_secret_synthetic');
  assert.equal(calls[2].options.headers.Authorization, undefined);
  assert.doesNotMatch(storedBody, /synthetic-facebook-user-token/);
  assert.match(storedBody, /Áo Bóng Đá Huế/);
  assert.equal(hashPushEndpoint(subscription.endpoint).length, 64);
  assert.equal(isValidPushSubscription(subscription), true);
  assert.equal(isValidPushSubscription({ ...subscription, endpoint: 'http://unsafe.test' }), false);
  assert.equal(isValidPushEndpoint('https://localhost/push/device'), false);
  assert.equal(isValidPushEndpoint('https://127.0.0.1/push/device'), false);
  assert.equal(isValidPushEndpoint('https://arbitrary-public.example/push/device'), false);
  assert.equal(isValidPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/device'), true);
  assert.equal(isValidPushEndpoint('https://web.push.apple.com/device'), true);
  assert.equal(isValidPushSubscription({ ...subscription, keys: { ...subscription.keys, auth: 'bad value' } }), false);
});

test('push readiness message reports the number of confirmed Pages', () => {
  const payload = buildPushReadyPayload(14);
  assert.match(payload.title, /TAStore68/);
  assert.match(payload.body, /14 Page/);
  assert.equal(payload.data.kind, 'setup');
});

test('Page webhook setup links each Page once without putting Page tokens in URLs', async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method !== 'POST') return Response.json({ data: [] });
    return Response.json({ success: true });
  };

  const result = await ensurePageWebhookSubscriptions([
    { id: '110129951561478', name: 'Page A', accessToken: 'synthetic-page-a-token' },
    { id: '2876310661997034', name: 'Page B', accessToken: 'synthetic-page-b-token' }
  ]);

  assert.equal(result.linkedCount, 2);
  assert.equal(result.failures.length, 0);
  assert.equal(calls.length, 4);
  assert.match(calls[0].url, /subscribed_apps/);
  assert.match(calls.find(call => call.options.method === 'POST').url, /subscribed_fields=messages%2Cstandby/);
  assert.doesNotMatch(calls[0].url, /synthetic-page-a-token/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-page-a-token');
});

test('Meta App callback setup preserves fields and updates only when production callback is missing', async () => {
  process.env.META_APP_ID = '123';
  process.env.META_APP_SECRET = 'synthetic-private-secret';
  process.env.FB_WEBHOOK_VERIFY_TOKEN = 'synthetic-verify-token';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/oauth/access_token')) {
      return Response.json({ access_token: 'synthetic-app-token' });
    }
    if (options.method === 'POST') return Response.json({ success: true });
    return Response.json({ data: [{
      object: 'page',
      active: true,
      callback_url: 'https://old.example/api/webhook',
      fields: ['message_reads']
    }] });
  };

  const result = await ensureAppWebhookSubscription('https://example.com');

  assert.equal(result.ok, true);
  assert.equal(result.updated, true);
  const update = calls.find(call => call.url.endsWith('/123/subscriptions') && call.options.method === 'POST');
  assert.equal(update.options.headers.Authorization, 'Bearer synthetic-app-token');
  assert.equal(update.options.body.get('callback_url'), 'https://example.com/api/webhook');
  assert.equal(update.options.body.get('verify_token'), 'synthetic-verify-token');
  assert.deepEqual(
    new Set(update.options.body.get('fields').split(',')),
    new Set(['message_reads', 'messages', 'standby'])
  );
  assert.doesNotMatch(update.url, /synthetic-private-secret|synthetic-app-token|synthetic-verify-token/);
});

test('Meta App callback setup is read-only when callback and message fields are already correct', async () => {
  process.env.META_APP_ID = '123';
  process.env.META_APP_SECRET = 'synthetic-private-secret';
  process.env.FB_WEBHOOK_VERIFY_TOKEN = 'synthetic-verify-token';
  const methods = [];
  globalThis.fetch = async (url, options = {}) => {
    methods.push(options.method || 'GET');
    if (String(url).includes('/oauth/access_token')) return Response.json({ access_token: 'synthetic-app-token' });
    return Response.json({ data: [{
      object: 'page',
      active: true,
      callback_url: 'https://example.com/api/webhook',
      fields: ['messages', 'standby']
    }] });
  };

  const result = await ensureAppWebhookSubscription('https://example.com');

  assert.equal(result.ok, true);
  assert.equal(result.updated, false);
  assert.deepEqual(methods, ['POST', 'GET']);
});

test('Page webhook setup returns the exact failed Page and Meta code', async () => {
  globalThis.fetch = async () => Response.json({
    error: { code: 200, error_subcode: 2018028, message: 'Synthetic permission failure' }
  }, { status: 403 });

  const result = await ensurePageWebhookSubscriptions([
    { id: '110129951561478', name: 'Page lỗi', accessToken: 'synthetic-page-token' }
  ]);

  assert.equal(result.linkedCount, 0);
  assert.equal(result.failures[0].pageName, 'Page lỗi');
  assert.equal(result.failures[0].code, 200);
  assert.equal(result.failures[0].subcode, 2018028);
});

test('existing messages and standby subscription is read-only on repeated bell presses', async () => {
  process.env.META_APP_ID = '123';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(options.method || 'GET');
    return Response.json({ data: [{ id: '123', subscribed_fields: ['messages', 'standby', 'message_reads'] }] });
  };
  assert.equal((await ensurePageWebhookSubscriptions([{ id: '1', accessToken: 'synthetic' }])).linkedCount, 1);
  assert.deepEqual(calls, ['GET']);
});

test('webhook setup preserves existing fields when adding standby', async () => {
  process.env.META_APP_ID = '123';
  let writeUrl;
  globalThis.fetch = async (url, options) => {
    if (options.method !== 'POST') return Response.json({ data: [{ id: '123', subscribed_fields: ['messages', 'message_reads'] }] });
    writeUrl = new URL(url);
    return Response.json({ success: true });
  };
  await ensurePageWebhookSubscriptions([{ id: '1', accessToken: 'synthetic' }]);
  assert.deepEqual(new Set(writeUrl.searchParams.get('subscribed_fields').split(',')), new Set(['messages', 'message_reads', 'standby']));
});

test('notification Page selection intersects permissions and excludes unselected Pages', () => {
  const pages = [{ id: '1' }, { id: '2' }];
  assert.deepEqual(selectNotificationPages(pages, ['1', '999']), [{ id: '1' }]);
  assert.deepEqual(selectNotificationPages(pages, []), []);
  assert.throws(() => selectNotificationPages(pages, 'all'), /không hợp lệ/);
});

test('a token from another Meta app cannot register a device with this backend', async () => {
  process.env.META_APP_ID = '123';
  globalThis.fetch = async () => Response.json({ id: '999' });
  await assert.rejects(verifyPushApp('synthetic'), { status: 403 });
});

test('push diagnostics rejects anonymous and cross-origin requests', async () => {
  assert.equal((await pushStatus.fetch(new Request('https://example.com/api/push/status', { method: 'POST' }))).status, 401);
  assert.equal((await pushStatus.fetch(new Request('https://example.com/api/push/status', { method: 'POST', headers: { origin: 'https://other.test' } }))).status, 403);
});

test('callback diagnostics distinguishes rejected app credentials from a missing callback', async () => {
  process.env.META_APP_ID = '123';
  process.env.META_APP_SECRET = 'synthetic-private-secret';
  process.env.SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_synthetic';
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'synthetic-public';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'synthetic-private';
  process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
  globalThis.fetch = async (url, options) => {
    assert.doesNotMatch(String(url), /synthetic-private-secret/);
    if (String(url).includes('/oauth/access_token')) {
      assert.equal(options.method, 'POST');
      assert.equal(options.body.get('client_secret'), 'synthetic-private-secret');
      return Response.json({ error: { code: 101, message: 'Invalid client secret synthetic-private-secret' } }, { status: 400 });
    }
    return Response.json([]);
  };
  const result = await getWebhookDiagnostics([{ id: '1', name: 'Synthetic Page' }], 'https://example.com');
  assert.equal(result.appCredentialsValid, false);
  assert.equal(result.callbackReady, null);
  assert.equal(result.callbackCheckAvailable, false);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-private-secret/);
});

test('signed standby messages enter the push pipeline and deduplicate against messaging echoes', async () => {
  process.env.META_APP_SECRET = 'synthetic-secret';
  process.env.SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_synthetic';
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'synthetic-public';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'synthetic-private';
  process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
  const claimed = new Set();
  let subscriptionReads = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      const row = JSON.parse(options.body);
      if (claimed.has(row.message_id)) return Response.json([]);
      claimed.add(row.message_id);
      return Response.json([row]);
    }
    subscriptionReads += 1;
    return Response.json([]);
  };
  const event = { sender: { id: '2' }, message: { mid: 'synthetic-mid', text: 'Synthetic test' } };
  const body = JSON.stringify({ object: 'page', entry: [{ id: '1', standby: [event, { message: { mid: 'echo', is_echo: true } }], messaging: [event] }] });
  const signature = 'sha256=' + crypto.createHmac('sha256', 'synthetic-secret').update(body).digest('hex');
  const response = await webhook.fetch(new Request('https://example.com/api/webhook', { method: 'POST', headers: { 'x-hub-signature-256': signature }, body }));
  assert.equal(response.status, 200);
  assert.deepEqual([...claimed], ['synthetic-mid']);
  assert.equal(subscriptionReads, 1);
});

test('a fully failed transient Push is released so the next delivery can retry', async () => {
  process.env.SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_synthetic';
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'synthetic-public';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'synthetic-private';
  process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
  const claimed = new Set();
  let releaseCount = 0;
  let deliveryAttempts = 0;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('push_events?message_id=eq.') && options.method === 'DELETE') {
      claimed.delete('synthetic-retry-mid');
      releaseCount += 1;
      return new Response(null, { status: 204 });
    }
    if (target.includes('push_events?') && options.method === 'POST') {
      const row = JSON.parse(options.body);
      if (claimed.has(row.message_id)) return Response.json([]);
      claimed.add(row.message_id);
      return Response.json([row]);
    }
    if (target.includes('push_subscriptions?')) {
      return Response.json([{
        endpoint_hash: 'synthetic-hash',
        endpoint: SYNTHETIC_PUSH_ENDPOINT,
        p256dh: SYNTHETIC_P256DH,
        auth: SYNTHETIC_AUTH,
        page_names: { '1': 'Page A' }
      }]);
    }
    throw new Error(`Unexpected synthetic request: ${target}`);
  };
  webpush.setVapidDetails = () => {};
  webpush.sendNotification = async () => {
    deliveryAttempts += 1;
    if (deliveryAttempts === 1) {
      throw Object.assign(new Error('Synthetic provider unavailable'), { statusCode: 503 });
    }
  };

  const event = { pageId: '1', senderPsid: '2', message: { mid: 'synthetic-retry-mid', text: 'Synthetic' } };
  const first = await sendPageMessagePush(event);
  const second = await sendPageMessagePush(event);

  assert.equal(first.sent, 0);
  assert.equal(first.retryableFailures, 1);
  assert.equal(releaseCount, 1);
  assert.equal(second.sent, 1);
  assert.equal(deliveryAttempts, 2);
});

test('webhook returns a temporary failure when every Push delivery fails transiently', async () => {
  process.env.META_APP_SECRET = 'synthetic-secret';
  process.env.SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_synthetic';
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'synthetic-public';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'synthetic-private';
  process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
  let released = false;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('push_events?message_id=eq.') && options.method === 'DELETE') {
      released = true;
      return new Response(null, { status: 204 });
    }
    if (target.includes('push_events?') && options.method === 'POST') {
      return Response.json([JSON.parse(options.body)]);
    }
    if (target.includes('push_subscriptions?')) {
      return Response.json([{
        endpoint_hash: 'synthetic-hash',
        endpoint: SYNTHETIC_PUSH_ENDPOINT,
        p256dh: SYNTHETIC_P256DH,
        auth: SYNTHETIC_AUTH,
        page_names: { '1': 'Page A' }
      }]);
    }
    throw new Error(`Unexpected synthetic request: ${target}`);
  };
  webpush.setVapidDetails = () => {};
  webpush.sendNotification = async () => {
    throw Object.assign(new Error('Synthetic provider unavailable'), { statusCode: 503 });
  };
  const body = JSON.stringify({
    object: 'page',
    entry: [{ id: '1', messaging: [{ sender: { id: '2' }, message: { mid: 'retry-mid', text: 'Synthetic' } }] }]
  });
  const signature = 'sha256=' + crypto.createHmac('sha256', 'synthetic-secret').update(body).digest('hex');
  const response = await webhook.fetch(new Request('https://example.com/api/webhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': signature },
    body
  }));

  assert.equal(response.status, 503);
  assert.equal(released, true);
});

test('push unsubscribe deletes only the hashed device endpoint', async () => {
  process.env.SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_synthetic';
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = 'synthetic-public';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'synthetic-private';
  process.env.WEB_PUSH_SUBJECT = 'mailto:test@example.com';
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    return new Response(null, { status: 204 });
  };
  const endpoint = `${SYNTHETIC_PUSH_ENDPOINT}/remove-me`;
  const response = await pushUnsubscribe.fetch(new Request(
    'https://example.com/api/push/unsubscribe',
    {
      method: 'POST',
      headers: { origin: 'https://example.com', 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint })
    }
  ));
  assert.equal(response.status, 200);
  assert.equal(urls.length, 1);
  assert.match(urls[0], new RegExp(hashPushEndpoint(endpoint)));
  assert.doesNotMatch(urls[0], /remove-me/);
});

