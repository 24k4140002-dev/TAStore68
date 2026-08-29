import {
  ensurePageWebhookSubscriptions,
  ensureAppWebhookSubscription,
  fetchManagedPages,
  getPushConfig,
  getLatestWebhookEvent,
  isValidPushSubscription,
  json,
  savePushSubscription,
  sendSubscriptionTestPush,
  selectNotificationPages,
  verifyPushApp
} from '../_lib/push.js';

function getBearerToken(request) {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function handleRequest(request) {
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  if (!getPushConfig().ready) return json({ error: 'Thông báo nền chưa được cấu hình' }, 503);

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'Nguồn yêu cầu không hợp lệ' }, 403);
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 16_384) return json({ error: 'Dữ liệu quá lớn' }, 413);

  const userToken = getBearerToken(request);
  if (!userToken) return json({ error: 'Cần kết nối Facebook trước' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Dữ liệu không hợp lệ' }, 400);
  }
  if (!isValidPushSubscription(body?.subscription)) {
    return json({ error: 'Đăng ký thông báo không hợp lệ' }, 400);
  }

  try {
    await verifyPushApp(userToken);
    const managedPages = selectNotificationPages(await fetchManagedPages(userToken), body.pageIds);
    if (!managedPages.length) return json({ error: 'Tài khoản không có Page được quản lý' }, 403);
    await savePushSubscription(body.subscription, managedPages);
    const appWebhookSetup = body.ensureWebhook === true
      ? await ensureAppWebhookSubscription(new URL(request.url).origin)
      : { ok: null, updated: false };
    const webhookSetup = body.ensureWebhook === true
      ? await ensurePageWebhookSubscriptions(managedPages)
      : { attempted: 0, linkedCount: 0, failures: [] };
    const latestWebhookEvent = body.ensureWebhook === true
      ? await getLatestWebhookEvent(managedPages).catch(() => null)
      : null;
    let testSent = false;
    if (body.sendTest === true) {
      try {
        await sendSubscriptionTestPush(body.subscription, managedPages);
        testSent = true;
      } catch {
        const error = new Error('Đã lưu thiết bị nhưng máy chủ chưa gửi được thông báo thử. Hãy bấm Bật Chuông để thử lại.');
        error.status = 502;
        throw error;
      }
    }
    return json({
      ok: true,
      pageCount: managedPages.length,
      testSent,
      webhookAttempted: webhookSetup.attempted,
      webhookLinkedCount: webhookSetup.linkedCount,
      webhookFailures: webhookSetup.failures,
      appWebhookReady: appWebhookSetup.ok,
      appWebhookUpdated: Boolean(appWebhookSetup.updated),
      appWebhookError: appWebhookSetup.ok === false ? appWebhookSetup.error : null,
      webhookObserved: Boolean(latestWebhookEvent?.created_at),
      lastWebhookAt: latestWebhookEvent?.created_at || null,
      lastWebhookPageId: latestWebhookEvent?.page_id || null
    });
  } catch (error) {
    return json({ error: error.message || 'Không thể bật thông báo' }, error.status || 502);
  }
}

export default { fetch: handleRequest };
