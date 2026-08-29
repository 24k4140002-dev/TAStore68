const JSON_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff'
};

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

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Allow': 'POST, OPTIONS',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method Not Allowed. Use POST.' }, 405, { Allow: 'POST, OPTIONS' });
  }

  if (isCrossOrigin(request)) {
    return json({ error: 'Cross-origin request is not allowed.' }, 403);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 16_384) {
    return json({ error: 'Request body is too large.' }, 413);
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return json({
      error: 'Máy chủ chưa cấu hình META_APP_ID và META_APP_SECRET.'
    }, 503);
  }

  let body;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > 16_384) {
      return json({ error: 'Request body is too large.' }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Dữ liệu JSON không hợp lệ.' }, 400);
  }

  const shortToken = typeof body?.shortToken === 'string' ? body.shortToken.trim() : '';
  if (!shortToken || shortToken.length > 4096) {
    return json({ error: 'Vui lòng cung cấp User Token ngắn hạn hợp lệ.' }, 400);
  }

  const exchangeUrl = new URL(`https://graph.facebook.com/${getGraphVersion()}/oauth/access_token`);
  exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token');
  exchangeUrl.searchParams.set('client_id', appId);
  exchangeUrl.searchParams.set('client_secret', appSecret);
  exchangeUrl.searchParams.set('fb_exchange_token', shortToken);

  try {
    const response = await fetch(exchangeUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000)
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.access_token) {
      const publicMessage = response.status === 429
        ? 'Meta đang giới hạn yêu cầu. Vui lòng thử lại sau.'
        : (data?.error?.message || 'Không thể đổi Token với Meta Graph API.');
      return json({ error: publicMessage }, response.status >= 400 ? response.status : 400);
    }

    return json({
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in
    });
  } catch (error) {
    const message = error?.name === 'TimeoutError'
      ? 'Meta Graph API phản hồi quá chậm. Vui lòng thử lại.'
      : 'Không thể kết nối Meta Graph API.';
    return json({ error: message }, 502);
  }
}

export default { fetch: handleRequest };
