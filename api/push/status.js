import { fetchManagedPages, getWebhookDiagnostics, json, selectNotificationPages, verifyPushApp } from '../_lib/push.js';

export default { async fetch(request) {
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') && request.headers.get('origin') !== origin) return json({ error: 'Nguồn yêu cầu không hợp lệ' }, 403);
  const token = (request.headers.get('authorization') || '').match(/^Bearer (.+)$/)?.[1];
  if (!token) return json({ error: 'Cần kết nối Facebook trước' }, 401);
  try {
    const raw = await request.text();
    if (raw.length > 8192) return json({ error: 'Dữ liệu quá lớn' }, 413);
    let body;
    try { body = JSON.parse(raw || '{}'); } catch { return json({ error: 'Dữ liệu không hợp lệ' }, 400); }
    await verifyPushApp(token);
    const allPages = await fetchManagedPages(token);
    if (!allPages.length) return json({ error: 'Không có Page được quản lý' }, 403);
    const selected = selectNotificationPages(allPages, body.pageIds);
    const pages = selected.length > 0 ? selected : allPages;
    return json(await getWebhookDiagnostics(pages, origin));
  } catch (error) {
    return json({ error: error.status ? error.message : 'Chưa đọc được tình trạng thông báo. Hãy thử lại.' }, error.status || 502);
  }
} };
