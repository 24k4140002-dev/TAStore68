import test from 'node:test';
import assert from 'node:assert/strict';

import {
  API_BASE,
  META_GRAPH_VERSION,
  cleanFacebookToken,
  formatMessengerSendError,
  generateSmartAntiSpam,
  isThreadControlError,
  safeFetch,
  sendMessengerMessage
} from '../src/services/facebookApi.js';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('uses the supported Graph API version by default', () => {
  assert.equal(META_GRAPH_VERSION, 'v26.0');
  assert.equal(API_BASE, 'https://graph.facebook.com/v26.0');
});

test('cleans copied Facebook tokens without changing their value', () => {
  assert.equal(cleanFacebookToken('  “EAA\u200Babc 123”\n'), 'EAAabc123');
});

test('anti-spam leaves single-page content untouched', () => {
  assert.equal(generateSmartAntiSpam('Nội dung', 0, 1), 'Nội dung');
});

test('safeFetch preserves Meta error code and subcode for diagnosis', async () => {
  globalThis.fetch = async () => Response.json({
    error: {
      message: 'Another app is controlling this thread now.',
      code: 10,
      error_subcode: 2018300,
      type: 'OAuthException'
    }
  }, { status: 400 });

  await assert.rejects(
    safeFetch('https://example.test'),
    error => error.code === 10 && error.subcode === 2018300 && isThreadControlError(error)
  );
});

test('does not mislabel every Meta error #10 as a thread-control problem', () => {
  const error = Object.assign(new Error('This message is sent outside of the allowed window.'), {
    code: 10,
    subcode: 2018278
  });

  assert.equal(isThreadControlError(error), false);
  assert.match(formatMessengerSendError(error).message, /24 giờ/);
});

test('takes thread control and retries only for the exact handover error', async () => {
  const requestedUrls = [];
  let messageAttempts = 0;

  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));

    if (String(url).includes('/me/messages')) {
      messageAttempts += 1;
      if (messageAttempts === 1) {
        return Response.json({
          error: {
            message: 'Another app is controlling this thread now.',
            code: 10,
            error_subcode: 2018300
          }
        }, { status: 400 });
      }
      return Response.json({ recipient_id: 'synthetic-user', message_id: 'synthetic-message' });
    }

    if (String(url).includes('/me/thread_owner')) {
      return Response.json({ data: [{ thread_owner: { app_id: 'synthetic-owner' } }] });
    }

    if (String(url).includes('/me/take_thread_control')) {
      return Response.json({ success: true });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await sendMessengerMessage('synthetic-user', 'Xin chào', 'synthetic-page-token');
  assert.equal(result.message_id, 'synthetic-message');
  assert.equal(messageAttempts, 2);
  assert.equal(requestedUrls.filter(url => url.includes('/me/take_thread_control')).length, 1);
  assert.equal(requestedUrls.some(url => url.includes('pass_thread_control')), false);
  assert.equal(requestedUrls.some(url => url.includes('CONFIRMED_EVENT_UPDATE')), false);
});

test('does not use handover endpoints for an expired messaging window', async () => {
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return Response.json({
      error: {
        message: 'This message is sent outside of the allowed window.',
        code: 10,
        error_subcode: 2018278
      }
    }, { status: 400 });
  };

  await assert.rejects(
    sendMessengerMessage('synthetic-user', 'Xin chào', 'synthetic-page-token'),
    /24 giờ/
  );
  assert.equal(requestedUrls.length, 1);
  assert.equal(requestedUrls.some(url => url.includes('thread_control')), false);
});

