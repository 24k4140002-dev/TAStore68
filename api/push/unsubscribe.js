import {
  getPushConfig,
  json,
  removePushSubscription
} from '../_lib/push.js';

async function handleRequest(request) {
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  if (!getPushConfig().ready) return json({ error: 'Thông báo nền chưa được cấu hình' }, 503);

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'Nguồn yêu cầu không hợp lệ' }, 403);
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 8_192) return json({ error: 'Dữ liệu quá lớn' }, 413);

  let body;
  try {
    body = await request.json();
    await removePushSubscription(body?.endpoint);
  } catch {
    return json({ error: 'Đăng ký thông báo không hợp lệ' }, 400);
  }
  return json({ ok: true });
}

export default { fetch: handleRequest };
