const JSON_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff'
};

const MAX_BODY_BYTES = 16_384;
const META_ID_PATTERN = /^\d{1,32}$/;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function getGraphVersion() {
  const configured = String(process.env.META_GRAPH_VERSION || 'v26.0').trim();
  return /^v\d+\.\d+$/.test(configured) ? configured : 'v26.0';
}

function isCrossOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}

function validMetaId(value) {
  return META_ID_PATTERN.test(String(value || ''));
}

function publicMetaError(data, fallbackStatus) {
  const error = data?.error || {};
  return {
    error: {
      message: error.message || `Meta Graph API trả về HTTP ${fallbackStatus}.`,
      code: error.code,
      error_subcode: error.error_subcode,
      type: error.type,
      error_user_title: error.error_user_title,
      error_user_msg: error.error_user_msg
    }
  };
}

function isUnavailableLabelRead(operation, data) {
  if (operation !== 'list_page_labels' && operation !== 'list_user_labels') return false;
  const code = Number(data?.error?.code || 0);
  const subcode = Number(data?.error?.error_subcode || 0);
  return (code === 100 && subcode === 33)
    || (code === 2 && subcode === 2018344);
}

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store, max-age=0' }
    });
  }
  if (request.method !== 'POST') {
    return json({ error: { message: 'Method Not Allowed. Use POST.' } }, 405, { Allow: 'POST, OPTIONS' });
  }
  if (isCrossOrigin(request)) {
    return json({ error: { message: 'Cross-origin request is not allowed.' } }, 403);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: { message: 'Request body is too large.' } }, 413);
  }

  let body;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return json({ error: { message: 'Request body is too large.' } }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: { message: 'Dữ liệu JSON không hợp lệ.' } }, 400);
  }

  const operation = String(body?.operation || '');
  const pageToken = typeof body?.pageToken === 'string' ? body.pageToken.trim() : '';
  if (!pageToken || pageToken.length > 4096) {
    return json({ error: { message: 'Thiếu Page Token hợp lệ.' } }, 400);
  }

  const graphUrl = new URL(`https://graph.facebook.com/${getGraphVersion()}/`);
  let method = 'GET';
  let graphBody;

  if (operation === 'list_page_labels') {
    if (!validMetaId(body.pageId)) return json({ error: { message: 'Page ID không hợp lệ.' } }, 400);
    graphUrl.pathname += `${body.pageId}/custom_labels`;
    graphUrl.searchParams.set('fields', 'id,page_label_name');
    graphUrl.searchParams.set('limit', '50');
  } else if (operation === 'list_user_labels') {
    if (!validMetaId(body.userPsid)) return json({ error: { message: 'PSID không hợp lệ.' } }, 400);
    graphUrl.pathname += `${body.userPsid}/custom_labels`;
    graphUrl.searchParams.set('fields', 'id,page_label_name');
  } else if (operation === 'create_label') {
    const labelName = typeof body.labelName === 'string' ? body.labelName.trim() : '';
    if (!validMetaId(body.pageId)) return json({ error: { message: 'Page ID không hợp lệ.' } }, 400);
    if (!labelName || labelName.length > 100) return json({ error: { message: 'Tên nhãn không hợp lệ.' } }, 400);
    graphUrl.pathname += `${body.pageId}/custom_labels`;
    method = 'POST';
    graphBody = new URLSearchParams({ page_label_name: labelName });
  } else if (operation === 'assign_label' || operation === 'unassign_label') {
    if (!validMetaId(body.labelId) || !validMetaId(body.userPsid)) {
      return json({ error: { message: 'Label ID hoặc PSID không hợp lệ.' } }, 400);
    }
    graphUrl.pathname += `${body.labelId}/label`;
    graphUrl.searchParams.set('user', String(body.userPsid));
    method = operation === 'assign_label' ? 'POST' : 'DELETE';
  } else {
    return json({ error: { message: 'Thao tác nhãn không được hỗ trợ.' } }, 400);
  }

  try {
    const response = await fetch(graphUrl, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${pageToken}`,
        ...(graphBody ? { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } : {})
      },
      body: graphBody,
      signal: AbortSignal.timeout(15_000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error) {
      // Some Pages/PSIDs do not expose Custom Labels to this app even though
      // Messenger itself works. Treat these known read-only responses as an
      // unavailable capability so the Inbox keeps local labels without flooding
      // DevTools with repeated 400s. Mutation failures still remain explicit.
      if (isUnavailableLabelRead(operation, data)) {
        return json({
          data: [],
          unsupported: true,
          metaError: {
            code: data?.error?.code,
            error_subcode: data?.error?.error_subcode
          }
        });
      }
      return json(publicMetaError(data, response.status), response.status >= 400 ? response.status : 400);
    }
    return json(data || {});
  } catch (error) {
    const message = error?.name === 'TimeoutError'
      ? 'Meta Graph API phản hồi quá chậm. Vui lòng thử lại.'
      : 'Không thể kết nối Meta Graph API.';
    return json({ error: { message } }, 502);
  }
}

export default { fetch: handleRequest };
