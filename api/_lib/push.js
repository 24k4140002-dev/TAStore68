import crypto from 'node:crypto';
import webpush from 'web-push';

const PUSH_TTL_SECONDS = 6 * 60 * 60;
const DEFAULT_PUSH_ENDPOINT_HOST_SUFFIXES = Object.freeze([
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'notify.windows.com'
]);

const JSON_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff'
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function getPushConfig() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '';
  const subject = process.env.WEB_PUSH_SUBJECT || '';
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    publicKey,
    privateKey,
    subject,
    supabaseUrl,
    serviceRoleKey,
    ready: Boolean(publicKey && privateKey && subject && supabaseUrl && serviceRoleKey)
  };
}

function supabaseHeaders(config, prefer = '') {
  return {
    apikey: config.serviceRoleKey,
    // New sb_secret_* keys are opaque and must not be sent as Bearer JWTs.
    // Legacy service_role JWTs still require Authorization to bypass RLS.
    ...(config.serviceRoleKey.startsWith('eyJ')
      ? { Authorization: `Bearer ${config.serviceRoleKey}` }
      : {}),
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function supabaseRequest(path, options = {}) {
  const config = getPushConfig();
  if (!config.ready) throw new Error('Push backend is not configured');
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(config, options.prefer),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Push storage failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function hashPushEndpoint(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

function getAllowedPushEndpointHostSuffixes() {
  const configured = String(process.env.WEB_PUSH_ALLOWED_ENDPOINT_HOSTS || '')
    .split(',')
    .map(value => value.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean);
  return [...new Set([...DEFAULT_PUSH_ENDPOINT_HOST_SUFFIXES, ...configured])];
}

function isBase64UrlValue(value, minLength, maxLength) {
  return typeof value === 'string'
    && value.length >= minLength
    && value.length <= maxLength
    && /^[A-Za-z0-9_-]+$/.test(value);
}

export function isValidPushEndpoint(endpointValue) {
  if (typeof endpointValue !== 'string' || endpointValue.length === 0 || endpointValue.length > 4096) return false;
  try {
    const endpoint = new URL(endpointValue);
    const hostname = endpoint.hostname.toLowerCase().replace(/\.$/, '');
    const trustedHost = getAllowedPushEndpointHostSuffixes().some(suffix => (
      hostname === suffix || hostname.endsWith(`.${suffix}`)
    ));
    return endpoint.protocol === 'https:'
      && !endpoint.username
      && !endpoint.password
      && (!endpoint.port || endpoint.port === '443')
      && endpoint.pathname.length > 1
      && trustedHost;
  } catch {
    return false;
  }
}

export async function checkPushStorage() {
  await supabaseRequest('push_subscriptions?select=endpoint_hash&limit=1');
  await supabaseRequest('push_events?select=message_id&limit=1');
  return true;
}

export function isValidPushSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') return false;
  const expirationTime = subscription.expirationTime;
  return isValidPushEndpoint(subscription.endpoint)
    && isBase64UrlValue(subscription.keys?.p256dh, 40, 512)
    && isBase64UrlValue(subscription.keys?.auth, 8, 128)
    && (expirationTime === null || expirationTime === undefined
      || (Number.isFinite(expirationTime) && expirationTime >= 0));
}

export async function fetchManagedPages(userToken) {
  const version = process.env.META_GRAPH_VERSION || 'v26.0';
  const url = new URL(`https://graph.facebook.com/${version}/me/accounts`);
  url.searchParams.set('fields', 'id,name,access_token');
  url.searchParams.set('limit', '200');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const error = new Error(payload.error?.message || 'Facebook token không hợp lệ');
    error.status = response.status === 401 ? 401 : 403;
    throw error;
  }
  return (Array.isArray(payload.data) ? payload.data : [])
    .filter(page => /^\d+$/.test(String(page.id || '')))
    .map(page => ({
      id: String(page.id),
      name: String(page.name || 'Fanpage').slice(0, 120),
      // Ephemeral: used only to subscribe this app to the Page webhook. It is
      // deliberately excluded from every Supabase row and API response.
      accessToken: typeof page.access_token === 'string' ? page.access_token : ''
    }));
}

export async function verifyPushApp(userToken) {
  const appId = process.env.META_APP_ID;
  if (!appId) throw Object.assign(new Error('Máy chủ chưa cấu hình ứng dụng Meta.'), { status: 503 });
  const response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v26.0'}/app?fields=id`, {
    headers: { Authorization: `Bearer ${userToken}` }, signal: AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || String(payload.id || '') !== String(appId)) {
    throw Object.assign(new Error('Token không thuộc ứng dụng Meta đang cấu hình nhận thông báo. Hãy kiểm tra App ID của token.'), { status: 403 });
  }
}

export function selectNotificationPages(pages, pageIds) {
  if (pageIds === undefined) return pages;
  if (!Array.isArray(pageIds) || pageIds.length > 200 || pageIds.some(id => typeof id !== 'string' || !/^\d+$/.test(id))) {
    throw Object.assign(new Error('Danh sách Page thông báo không hợp lệ.'), { status: 400 });
  }
  const selected = new Set(pageIds);
  return pages.filter(page => selected.has(page.id));
}

export async function getWebhookDiagnostics(pages, expectedOrigin) {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  const graph = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v26.0'}`;
  // Obtain the canonical app token instead of relying on the composite format.
  // The secret remains in a server-to-Meta POST body, never a URL or response.
  const tokenResponse = await fetch(`${graph}/oauth/access_token`, {
    method: 'POST', body: new URLSearchParams({ client_id: appId || '', client_secret: secret || '', grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(15_000)
  });
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  const appCredentialsValid = tokenResponse.ok && typeof tokenPayload.access_token === 'string';
  const response = appCredentialsValid ? await fetch(`${graph}/${appId}/subscriptions`, {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` }, signal: AbortSignal.timeout(15_000)
  }) : tokenResponse;
  const payload = appCredentialsValid ? await response.json().catch(() => ({})) : tokenPayload;
  const subscription = payload.data?.find(item => item.object === 'page');
  const fields = (subscription?.fields || []).map(field => typeof field === 'string' ? field : field.name);
  const expectedCallback = `${expectedOrigin}/api/webhook`;
  const latest = await getLatestWebhookEvent(pages);
  const ids = pages.map(page => page.id).filter(id => /^\d+$/.test(id));
  const rows = ids.length ? await supabaseRequest(`push_subscriptions?select=page_ids,updated_at&page_ids=ov.{${ids.join(',')}}`) : [];
  const activeSince = Date.now() - 30 * 24 * 60 * 60_000;
  return {
    appCredentialsValid,
    callbackCheckAvailable: response.ok && !payload.error,
    callbackReady: !response.ok || payload.error ? null : Boolean(subscription?.active && subscription.callback_url === expectedCallback && fields.includes('messages')),
    callbackErrorCode: payload.error?.code || null,
    callbackError: payload.error ? String(payload.error.message || 'Meta từ chối đọc cấu hình callback.')
      .replaceAll(String(secret || '__missing_secret__'), '[redacted]')
      .replaceAll(String(tokenPayload.access_token || '__missing_token__'), '[redacted]').replace(/EAA[A-Za-z0-9]+/g, '[redacted]').slice(0, 240) : null,
    // Public callback URL only; never expose app credentials or push endpoints.
    callbackUrl: subscription?.callback_url || null,
    callbackFields: fields,
    lastWebhookAt: latest?.created_at || null,
    lastWebhookPageId: latest?.page_id || null,
    pages: pages.map(page => ({
      pageId: page.id, pageName: page.name,
      activeDevices: (rows || []).filter(row => row.page_ids?.includes(page.id) && Date.parse(row.updated_at) > activeSince).length
    }))
  };
}

export async function ensureAppWebhookSubscription(expectedOrigin) {
  const appId = process.env.META_APP_ID || '';
  const secret = process.env.META_APP_SECRET || '';
  const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN || '';
  const graph = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v26.0'}`;
  const callbackUrl = `${String(expectedOrigin || '').replace(/\/$/, '')}/api/webhook`;
  if (!appId || !secret || !verifyToken || !/^https:\/\//i.test(callbackUrl)) {
    return { ok: false, updated: false, callbackUrl, error: 'Máy chủ thiếu cấu hình callback Meta.' };
  }

  try {
    const tokenResponse = await fetch(`${graph}/oauth/access_token`, {
      method: 'POST',
      body: new URLSearchParams({ client_id: appId, client_secret: secret, grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(15_000)
    });
    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    const appToken = typeof tokenPayload.access_token === 'string' ? tokenPayload.access_token : '';
    if (!tokenResponse.ok || !appToken) {
      return { ok: false, updated: false, callbackUrl, error: 'Meta không chấp nhận App ID/App Secret.' };
    }

    const listSubscriptions = async () => {
      const response = await fetch(`${graph}/${appId}/subscriptions`, {
        headers: { Authorization: `Bearer ${appToken}` },
        signal: AbortSignal.timeout(15_000)
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    };
    const currentResult = await listSubscriptions();
    if (!currentResult.response.ok || currentResult.payload.error) {
      return { ok: false, updated: false, callbackUrl, error: 'Meta không cho đọc cấu hình callback hiện tại.' };
    }

    const current = currentResult.payload.data?.find(item => item.object === 'page');
    const currentFields = (current?.fields || [])
      .map(field => typeof field === 'string' ? field : field?.name)
      .filter(Boolean);
    const requiredFields = ['messages', 'standby'];
    const alreadyReady = Boolean(
      current?.active
      && current.callback_url === callbackUrl
      && requiredFields.every(field => currentFields.includes(field))
    );
    if (alreadyReady) {
      return { ok: true, updated: false, callbackUrl, fields: currentFields };
    }

    const fields = [...new Set([...currentFields, ...requiredFields])];
    const updateResponse = await fetch(`${graph}/${appId}/subscriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${appToken}` },
      body: new URLSearchParams({
        object: 'page',
        callback_url: callbackUrl,
        fields: fields.join(','),
        verify_token: verifyToken
      }),
      signal: AbortSignal.timeout(20_000)
    });
    const updatePayload = await updateResponse.json().catch(() => ({}));
    if (!updateResponse.ok || updatePayload.error || updatePayload.success !== true) {
      return {
        ok: false,
        updated: false,
        callbackUrl,
        error: String(updatePayload.error?.message || 'Meta từ chối cập nhật callback.').slice(0, 240)
          .replaceAll(secret, '[redacted]')
          .replaceAll(appToken, '[redacted]')
          .replace(/EAA[A-Za-z0-9]+/g, '[redacted]')
      };
    }
    return { ok: true, updated: true, callbackUrl, fields };
  } catch (error) {
    return {
      ok: false,
      updated: false,
      callbackUrl,
      error: error?.name === 'TimeoutError' ? 'Meta phản hồi quá chậm khi cấu hình callback.' : 'Không kết nối được Meta để cấu hình callback.'
    };
  }
}

export async function ensurePageWebhookSubscriptions(pages) {
  const version = process.env.META_GRAPH_VERSION || 'v26.0';
  const results = [];

  for (let index = 0; index < pages.length; index += 3) {
    const batch = pages.slice(index, index + 3);
    const batchResults = await Promise.all(batch.map(async page => {
      if (!page.accessToken) {
        return { pageId: page.id, pageName: page.name, ok: false, code: null, message: 'Meta không cấp Page Token.' };
      }

      const url = new URL(`https://graph.facebook.com/${version}/${page.id}/subscribed_apps`);
      try {
        // Preserve existing read/echo/handover fields. Never blindly replace the
        // app's subscription every time a device presses the bell.
        const headers = { Accept: 'application/json', Authorization: `Bearer ${page.accessToken}` };
        const existingResponse = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
        const existing = await existingResponse.json().catch(() => ({}));
        if (!existingResponse.ok || existing.error || !Array.isArray(existing.data)) {
          return { pageId: page.id, pageName: page.name, ok: false,
            code: existing.error?.code || null, subcode: existing.error?.error_subcode || null,
            message: 'Không đọc được cấu hình webhook hiện tại; giữ nguyên để tránh ghi đè.' };
        }
        const current = existing.data.find(app => String(app.id) === String(process.env.META_APP_ID));
        const currentFields = Array.isArray(current?.subscribed_fields) ? current.subscribed_fields : [];
        const requiredFields = ['messages', 'standby'];
        if (requiredFields.every(field => currentFields.includes(field))) {
          return { pageId: page.id, pageName: page.name, ok: true };
        }
        url.searchParams.set('subscribed_fields', [...new Set([...currentFields, ...requiredFields])].join(','));
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${page.accessToken}`
          },
          signal: AbortSignal.timeout(15_000)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.error || payload?.success !== true) {
          return {
            pageId: page.id,
            pageName: page.name,
            ok: false,
            code: payload?.error?.code || null,
            subcode: payload?.error?.error_subcode || null,
            message: payload?.error?.error_user_msg || payload?.error?.message || `HTTP ${response.status}`
          };
        }
        return { pageId: page.id, pageName: page.name, ok: true };
      } catch (error) {
        return {
          pageId: page.id,
          pageName: page.name,
          ok: false,
          code: null,
          message: error?.name === 'TimeoutError' ? 'Meta phản hồi quá chậm.' : 'Không kết nối được Meta.'
        };
      }
    }));
    results.push(...batchResults);
  }

  const failures = results.filter(result => !result.ok).map(result => ({
    pageId: result.pageId,
    pageName: result.pageName,
    code: result.code,
    subcode: result.subcode,
    message: String(result.message || 'Meta từ chối liên kết webhook.').slice(0, 240)
  }));
  return {
    attempted: results.length,
    linkedCount: results.length - failures.length,
    failures
  };
}

export async function getLatestWebhookEvent(pages) {
  const pageIds = pages.map(page => String(page.id || '')).filter(id => /^\d+$/.test(id));
  if (!pageIds.length) return null;
  const query = new URLSearchParams({
    select: 'page_id,created_at',
    page_id: `in.(${pageIds.join(',')})`,
    order: 'created_at.desc',
    limit: '1'
  });
  const rows = await supabaseRequest(`push_events?${query}`);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export async function savePushSubscription(subscription, pages) {
  const pageNames = Object.fromEntries(pages.map(page => [page.id, page.name]));
  const row = {
    endpoint_hash: hashPushEndpoint(subscription.endpoint),
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    expiration_time: subscription.expirationTime || null,
    page_ids: pages.map(page => page.id),
    page_names: pageNames,
    updated_at: new Date().toISOString()
  };
  await supabaseRequest('push_subscriptions?on_conflict=endpoint_hash', {
    method: 'POST',
    body: JSON.stringify(row),
    prefer: 'resolution=merge-duplicates,return=minimal'
  });
  const oldEventCutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  await supabaseRequest(`push_events?created_at=lt.${encodeURIComponent(oldEventCutoff)}`, {
    method: 'DELETE',
    prefer: 'return=minimal'
  }).catch(() => {});
}

export function buildPushReadyPayload(pageCount = 0) {
  const safePageCount = Math.max(0, Number(pageCount) || 0);
  return {
    title: 'TAStore68 • Thông báo thử',
    body: `Đã đăng ký ${safePageCount} Page. Đây là tin thử thiết bị, chưa xác nhận tin khách từ Meta.`,
    data: {
      kind: 'setup',
      pageId: 'all',
      convId: '',
      senderPsid: ''
    }
  };
}

export async function sendSubscriptionTestPush(subscription, pages = []) {
  const config = getPushConfig();
  if (!config.ready) throw new Error('Push backend is not configured');
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  await webpush.sendNotification(
    subscription,
    JSON.stringify(buildPushReadyPayload(pages.length)),
    { TTL: PUSH_TTL_SECONDS, urgency: 'high', timeout: 3000 }
  );
}

async function claimPushEvent(messageId, pageId) {
  const rows = await supabaseRequest('push_events?on_conflict=message_id', {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId, page_id: pageId }),
    prefer: 'resolution=ignore-duplicates,return=representation'
  });
  return Array.isArray(rows) && rows.length > 0;
}

async function releasePushEvent(messageId) {
  await supabaseRequest(`push_events?message_id=eq.${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
    prefer: 'return=minimal'
  });
}

async function listPageSubscriptions(pageId) {
  const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const query = new URLSearchParams({
    select: 'endpoint_hash,endpoint,p256dh,auth,page_names',
    page_ids: `cs.{${pageId}}`,
    updated_at: `gte.${activeSince}`
  });
  return supabaseRequest(`push_subscriptions?${query}`);
}

async function deleteSubscription(endpointHash) {
  await supabaseRequest(`push_subscriptions?endpoint_hash=eq.${encodeURIComponent(endpointHash)}`, {
    method: 'DELETE',
    prefer: 'return=minimal'
  });
}

export async function removePushSubscription(endpoint) {
  if (!isValidPushEndpoint(endpoint)) throw new Error('Invalid push endpoint');
  await deleteSubscription(hashPushEndpoint(endpoint));
}

function describeMessage(message) {
  const text = String(message?.text || '').trim();
  if (text) return text.slice(0, 180);
  const types = [...new Set((message?.attachments || []).map(item => item?.type).filter(Boolean))];
  if (types.includes('image')) return 'Khách vừa gửi một hình ảnh';
  if (types.includes('video')) return 'Khách vừa gửi một video';
  if (types.includes('audio')) return 'Khách vừa gửi một đoạn âm thanh';
  if (types.includes('file')) return 'Khách vừa gửi một tệp';
  if (types.includes('location')) return 'Khách vừa gửi vị trí';
  return 'Khách vừa gửi tin nhắn mới';
}

export async function sendPageMessagePush({ pageId, senderPsid, message }) {
  const config = getPushConfig();
  if (!config.ready || !message?.mid || message?.is_echo) {
    return { attempted: 0, sent: 0, failed: 0, expired: 0, skipped: true };
  }
  const messageId = String(message.mid);
  if (!(await claimPushEvent(messageId, String(pageId)))) {
    return { attempted: 0, sent: 0, failed: 0, expired: 0, duplicate: true };
  }

  let subscriptions;
  try {
    subscriptions = await listPageSubscriptions(String(pageId));
  } catch (error) {
    await releasePushEvent(messageId).catch(() => {});
    throw error;
  }
  if (!subscriptions?.length) return { attempted: 0, sent: 0, failed: 0, expired: 0 };
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  let expired = 0;

  const deliveries = await Promise.allSettled(subscriptions.map(async row => {
    const pageName = row.page_names?.[String(pageId)] || 'Fanpage';
    const payload = JSON.stringify({
      title: `${pageName} • Tin nhắn mới`,
      body: describeMessage(message),
      data: {
        pageId: String(pageId),
        pageName,
        senderPsid: String(senderPsid || ''),
        messageId
      }
    });
    try {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      };
      if (!isValidPushSubscription(subscription)) {
        throw Object.assign(new Error('Stored push subscription is invalid'), { statusCode: 410 });
      }
      await webpush.sendNotification(subscription, payload, { TTL: PUSH_TTL_SECONDS, urgency: 'high', timeout: 3000 });
      return true;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        expired += 1;
        await deleteSubscription(row.endpoint_hash).catch(() => {});
      }
      throw error;
    }
  }));

  const sent = deliveries.filter(item => item.status === 'fulfilled').length;
  const transientFailures = deliveries.filter(item => (
    item.status === 'rejected'
    && item.reason?.statusCode !== 404
    && item.reason?.statusCode !== 410
  )).length;
  // When no device received the event, release the dedupe claim so Meta's
  // retry (triggered by the webhook 503) can try again. Partial success keeps
  // the claim to avoid alerting already-delivered devices twice.
  if (sent === 0 && transientFailures > 0) {
    await releasePushEvent(messageId).catch(() => {});
  }
  return {
    attempted: deliveries.length,
    sent,
    failed: deliveries.length - sent,
    expired,
    retryableFailures: transientFailures
  };
}
