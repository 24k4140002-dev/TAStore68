import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import exchangeToken from '../api/meta/exchange-token.js';
import webhook from '../api/webhook.js';

const originalFetch = globalThis.fetch;
const originalEnv = {
  appId: process.env.META_APP_ID,
  appSecret: process.env.META_APP_SECRET,
  graphVersion: process.env.META_GRAPH_VERSION,
  verifyToken: process.env.FB_WEBHOOK_VERIFY_TOKEN
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  setEnv('META_APP_ID', originalEnv.appId);
  setEnv('META_APP_SECRET', originalEnv.appSecret);
  setEnv('META_GRAPH_VERSION', originalEnv.graphVersion);
  setEnv('FB_WEBHOOK_VERIFY_TOKEN', originalEnv.verifyToken);
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

