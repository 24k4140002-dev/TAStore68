import test from 'node:test';
import assert from 'node:assert/strict';

import {
  API_BASE,
  META_GRAPH_VERSION,
  assignLabelToUser,
  canMarkConversationSeen,
  cleanFacebookToken,
  createPageLabel,
  fetchAllPagesUnreadSummary,
  fetchAdAccountInsights,
  fetchAdAccounts,
  fetchCampaignAds,
  fetchCampaignsWithInsights,
  fetchConversationMessages,
  fetchDailyAccountInsights,
  fetchPageConversations,
  fetchPageConversationHeads,
  fetchPageLabels,
  fetchUserLabels,
  formatMessengerSendError,
  generateSmartAntiSpam,
  isThreadControlError,
  markConversationAsRead,
  publishToFacebookPage,
  runInChunks,
  safeFetch,
  sendMessengerMessage,
  toggleCampaignStatus,
  updateCampaignBudget,
  unassignLabelFromUser
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

test('Ads reads move tokens to Authorization headers and inherit safeFetch timeout handling', async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return Response.json({ data: [] });
  };

  await fetchAdAccounts('synthetic-ads-token');
  await fetchAdAccountInsights('act_1', 'synthetic-ads-token', 'today');
  await fetchDailyAccountInsights('act_1', 'synthetic-ads-token', 'last_7d');
  await fetchCampaignsWithInsights('act_1', 'synthetic-ads-token', 'today', 'VND');
  await fetchCampaignAds('campaign_1', 'synthetic-ads-token', 'today');

  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.doesNotMatch(call.url, /access_token|synthetic-ads-token/);
    assert.equal(new Headers(call.options.headers).get('Authorization'), 'Bearer synthetic-ads-token');
    assert.ok(call.options.signal);
  }
});

test('anti-spam compatibility helper never mutates user content', () => {
  assert.equal(generateSmartAntiSpam('Nội dung', 1, 3), 'Nội dung');
});

test('chunked Page loading publishes progressive batches without changing order', async () => {
  const published = [];
  const results = await runInChunks(
    [1, 2, 3, 4, 5],
    async value => value * 10,
    2,
    0,
    (batch, progress) => published.push({
      values: batch.map(result => result.value),
      processedCount: progress.processedCount
    })
  );
  assert.deepEqual(results.map(result => result.value), [10, 20, 30, 40, 50]);
  assert.deepEqual(published, [
    { values: [10, 20], processedCount: 2 },
    { values: [30, 40], processedCount: 4 },
    { values: [50], processedCount: 5 }
  ]);
});

test('Meta mark-seen is attempted only for a recent unread customer message', () => {
  const now = Date.parse('2026-08-26T06:00:00.000Z');
  const conversation = {
    unread_count: 1,
    customer_psid: 'customer_1',
    last_sender_id: 'customer_1',
    page_id: 'page_1',
    can_reply: true,
    reply_deadline: '2026-08-26T07:00:00.000Z'
  };
  assert.equal(canMarkConversationSeen(conversation, now), true);
  assert.equal(canMarkConversationSeen({ ...conversation, unread_count: 0 }, now), false);
  assert.equal(canMarkConversationSeen({ ...conversation, last_sender_id: 'page_1' }, now), false);
  assert.equal(canMarkConversationSeen({ ...conversation, reply_deadline: '2026-08-26T05:00:00.000Z' }, now), false);
});

test('publishes a 50-photo album with progress and all attached media', async () => {
  const requests = [];
  let photoNumber = 0;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/page_1/photos')) {
      photoNumber += 1;
      return Response.json({ id: `photo_${photoNumber}` });
    }
    return Response.json({ id: 'page_1_post_1' });
  };
  const progress = [];
  const photos = Array.from({ length: 50 }, () => new Blob(['image'], { type: 'image/jpeg' }));

  const response = await publishToFacebookPage({ id: 'page_1', access_token: 'synthetic-page-token' }, {
    postType: 'photo',
    postText: 'Album 50 ảnh',
    mediaFiles: photos,
    onMediaProgress: (uploaded, total) => progress.push([uploaded, total])
  });

  const feedRequest = requests.find(request => request.url.endsWith('/page_1/feed'));
  assert.equal(response.id, 'page_1_post_1');
  assert.equal(requests.filter(request => request.url.endsWith('/page_1/photos')).length, 50);
  assert.equal(JSON.parse(feedRequest.options.body.get('attached_media')).length, 50);
  assert.deepEqual(progress.at(-1), [50, 50]);
});

test('cleans only unpublished photos from an interrupted album upload', async () => {
  const deletedIds = [];
  let photoNumber = 0;
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (options.method === 'DELETE') {
      deletedIds.push(requestUrl.split('/').at(-1));
      return Response.json({ success: true });
    }
    if (requestUrl.endsWith('/page_1/photos')) {
      photoNumber += 1;
      if (photoNumber === 3) {
        return Response.json({ error: { message: 'Upload failed', code: 100 } }, { status: 400 });
      }
      return Response.json({ id: `draft_${photoNumber}` });
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };
  const photos = Array.from({ length: 5 }, () => new Blob(['image'], { type: 'image/jpeg' }));

  await assert.rejects(
    publishToFacebookPage({ id: 'page_1', access_token: 'synthetic-page-token' }, {
      postType: 'photo',
      mediaFiles: photos
    }),
    /Upload failed/
  );
  assert.deepEqual(deletedIds.sort(), ['draft_1', 'draft_2']);
});

test('Ads mutations preserve VND budget units and include the access token', async () => {
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), body: options.body, headers: options.headers });
    return Response.json({ success: true });
  };

  await updateCampaignBudget('campaign_1', 200000, 'synthetic-token', 'VND');
  await toggleCampaignStatus('campaign_1', 'PAUSED', 'synthetic-token');

  assert.equal(requests[0].body.get('daily_budget'), '200000');
  assert.equal(requests[0].body.get('access_token'), null);
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer synthetic-token');
  assert.equal(requests[1].body.get('status'), 'PAUSED');
  assert.equal(requests[1].body.get('access_token'), null);
  assert.equal(requests[1].headers.get('Authorization'), 'Bearer synthetic-token');
});

test('fetches only the requested recent message window', async () => {
  let requestedUrl = '';
  let requestedHeaders = null;
  globalThis.fetch = async (url, options = {}) => {
    requestedUrl = String(url);
    requestedHeaders = options.headers;
    return Response.json({ data: [] });
  };

  await fetchConversationMessages('conversation_1', 'synthetic-page-token', null, 30);

  assert.equal(new URL(requestedUrl).searchParams.get('limit'), '30');
  assert.equal(new URL(requestedUrl).searchParams.get('access_token'), null);
  assert.equal(requestedHeaders.get('Authorization'), 'Bearer synthetic-page-token');
});

test('uses the current Meta Custom Labels fields and maps Page labels', async () => {
  let request = null;
  globalThis.fetch = async (url, options = {}) => {
    request = { url: String(url), body: JSON.parse(options.body) };
    return Response.json({ data: [{ id: 'label_1', page_label_name: 'Đã đặt hàng' }] });
  };

  const labels = await fetchPageLabels('page_1', 'synthetic-page-token');

  assert.equal(request.url, '/api/meta/custom-labels');
  assert.equal(request.body.operation, 'list_page_labels');
  assert.equal(request.body.pageId, 'page_1');
  assert.equal(request.body.pageToken, 'synthetic-page-token');
  assert.deepEqual(labels[0], {
    id: 'label_1',
    name: 'Đã đặt hàng',
    emoji: '✅',
    color: '#10b981',
    page_id: 'page_1',
    source: 'meta'
  });
});

test('creates and assigns labels through the current Meta label endpoints', async () => {
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body);
    requests.push({ url: String(url), method: options.method || 'GET', body });
    return Response.json(body.operation === 'create_label' ? { id: 'label_1' } : { success: true });
  };

  await createPageLabel('page_1', 'synthetic-page-token', 'Đã đặt hàng');
  await assignLabelToUser('label_1', 'psid_1', 'synthetic-page-token');
  await unassignLabelFromUser('label_1', 'psid_1', 'synthetic-page-token');

  assert.equal(requests[0].url, '/api/meta/custom-labels');
  assert.deepEqual(requests.map(request => request.body.operation), [
    'create_label',
    'assign_label',
    'unassign_label'
  ]);
  assert.equal(requests[0].body.labelName, 'Đã đặt hàng');
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[2].method, 'POST');
});

test('fetches assigned labels for a PSID without the obsolete name field', async () => {
  let request = null;
  globalThis.fetch = async (url, options = {}) => {
    request = { url: String(url), body: JSON.parse(options.body) };
    return Response.json({ data: [{ id: 'label_1', page_label_name: 'Khách VIP' }] });
  };

  const labels = await fetchUserLabels('psid_1', 'synthetic-page-token');

  assert.equal(request.url, '/api/meta/custom-labels');
  assert.equal(request.body.operation, 'list_user_labels');
  assert.equal(request.body.userPsid, 'psid_1');
  assert.equal(labels[0].name, 'Khách VIP');
  assert.equal(labels[0].source, 'meta');
});

test('conversation list surfaces Meta failures instead of pretending the Page is empty', async () => {
  globalThis.fetch = async () => Response.json({
    error: { message: 'Permissions error', code: 200, type: 'OAuthException' }
  }, { status: 403 });

  await assert.rejects(
    fetchPageConversations('110129951561478', 'Áo Bóng Đá Huế', 'synthetic-page-token'),
    error => error.code === 200 && error.httpStatus === 403
  );
});

test('conversation list supports a smaller refresh window for multi-Page polling', async () => {
  let requestedUrl = '';
  globalThis.fetch = async url => {
    requestedUrl = String(url);
    return Response.json({ data: [] });
  };

  await fetchPageConversations('page_1', 'Page A', 'synthetic-page-token', null, 10);

  assert.equal(new URL(requestedUrl).searchParams.get('limit'), '10');
});

test('cross-Page notification scan fetches lightweight message heads with Page identity', async () => {
  let requestedUrl = '';
  globalThis.fetch = async url => {
    requestedUrl = String(url);
    return Response.json({
      data: [{
        id: 'conversation_1',
        updated_time: '2026-08-24T01:00:00Z',
        participants: { data: [{ id: '110129951561478', name: 'Page' }, { id: '99', name: 'Khách A' }] },
        messages: { data: [{ id: 'mid_1', message: 'Shop ơi', created_time: '2026-08-24T01:00:00Z', from: { id: '99' } }] }
      }]
    });
  };

  const heads = await fetchPageConversationHeads(
    '110129951561478',
    'Áo Bóng Đá Huế',
    'synthetic-page-token',
    10
  );

  const parsedUrl = new URL(requestedUrl);
  assert.equal(parsedUrl.searchParams.get('limit'), '10');
  assert.equal(heads[0].page_id, '110129951561478');
  assert.equal(heads[0].page_name, 'Áo Bóng Đá Huế');
  assert.equal(heads[0].message_id, 'mid_1');
  assert.equal(heads[0].sender_id, '99');
  assert.equal(heads[0].customer_name, 'Khách A');
});

test('marks a Messenger thread seen through the supported sender action', async () => {
  let request = null;
  globalThis.fetch = async (url, options = {}) => {
    request = { url: String(url), options };
    return Response.json({ recipient_id: 'psid_1' });
  };

  await markConversationAsRead('psid_1', 'synthetic-page-token');

  assert.match(request.url, /\/me\/messages$/);
  assert.equal(request.options.headers.get('Authorization'), 'Bearer synthetic-page-token');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), {
    recipient: { id: 'psid_1' },
    sender_action: 'mark_seen'
  });
});

test('confirms a read only after Meta reports unread_count zero', async () => {
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (options.method === 'POST') return Response.json({ recipient_id: 'psid_1' });
    return Response.json({ id: 'conv_1', unread_count: 0, updated_time: '2026-08-28T00:00:00Z' });
  };

  const result = await markConversationAsRead('psid_1', 'synthetic-page-token', 'conv_1');

  assert.equal(result.confirmed, true);
  assert.equal(result.unreadCount, 0);
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /\/conv_1\?fields=/);
});

test('read confirmation waits through transient Meta propagation before succeeding', async () => {
  let readbacks = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') return Response.json({ recipient_id: 'psid_1' });
    readbacks += 1;
    return Response.json({
      id: 'conv_1',
      unread_count: readbacks < 3 ? 1 : 0,
      updated_time: '2026-08-29T00:00:00Z'
    });
  };

  const result = await markConversationAsRead('psid_1', 'synthetic-page-token', 'conv_1');

  assert.equal(result.confirmed, true);
  assert.equal(readbacks, 3);
});

test('conversation list trusts Meta unread_count instead of a browser-local watermark', async () => {
  globalThis.fetch = async () => Response.json({
    data: [{
      id: 'conv_1',
      updated_time: '2026-08-28T00:00:00Z',
      unread_count: 2,
      participants: { data: [{ id: 'customer_1', name: 'Khách A' }] },
      messages: { data: [{ id: 'mid_1', message: 'Mới', from: { id: 'customer_1' } }] }
    }]
  });
  const oldLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => key === 'metapost_read_map' ? JSON.stringify({ conv_1: '2099-01-01T00:00:00Z' }) : null
  };
  try {
    const conversations = await fetchPageConversations('page_1', 'Page A', 'synthetic-page-token');
    assert.equal(conversations[0].unread_count, 2);
    assert.equal(conversations[0].meta_unread_count, 2);
  } finally {
    globalThis.localStorage = oldLocalStorage;
  }
});

test('unread summary exposes a Page fetch failure instead of reporting a clean zero', async () => {
  globalThis.fetch = async () => Response.json({ error: { code: 190, message: 'Synthetic token error' } }, { status: 400 });
  const summary = await fetchAllPagesUnreadSummary([{ id: 'page_1', name: 'Page A' }], 'synthetic-token');
  assert.equal(summary.total, 0);
  assert.equal(summary.perPage[0].error, true);
});

test('message fetch rejects API failures instead of pretending the chat is empty', async () => {
  globalThis.fetch = async () => Response.json({ error: { code: 190, message: 'Synthetic token error' } }, { status: 400 });
  await assert.rejects(
    fetchConversationMessages('conv_1', 'synthetic-token'),
    /Synthetic token error/
  );
});

test('sends text and an image as two Meta messages without dropping the caption', async () => {
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return Response.json({ recipient_id: 'psid_1', message_id: `mid_${requests.length}` });
  };

  const image = new Blob(['synthetic-image'], { type: 'image/png' });
  const response = await sendMessengerMessage('psid_1', 'Ảnh mẫu', 'synthetic-page-token', image);

  assert.equal(requests.length, 2);
  assert.equal(JSON.parse(requests[0].options.body).message.text, 'Ảnh mẫu');
  assert.ok(requests[1].options.body instanceof FormData);
  assert.equal(response.message_id, 'mid_1');
  assert.equal(response.attachment_message_id, 'mid_2');
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

