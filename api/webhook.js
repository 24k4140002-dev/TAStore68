import crypto from 'node:crypto';

const TEXT_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'text/plain; charset=utf-8',
  'X-Content-Type-Options': 'nosniff'
};

function text(body, status = 200) {
  return new Response(body, { status, headers: TEXT_HEADERS });
}

function signaturesMatch(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader?.startsWith('sha256=')) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')}`;

  const receivedBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN;

  if (request.method === 'GET') {
    if (!verifyToken) return text('Webhook is not configured', 503);

    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === verifyToken && challenge) {
      return text(challenge);
    }
    return text('Verification token mismatch', 403);
  }

  if (request.method !== 'POST') {
    return text('Method Not Allowed', 405);
  }

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return text('Webhook is not configured', 503);

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 1_048_576) return text('Payload too large', 413);

  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  if (!signaturesMatch(rawBody, signature, appSecret)) {
    return text('Invalid webhook signature', 401);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return text('Invalid JSON payload', 400);
  }

  if (payload?.object !== 'page') return text('EVENT_RECEIVED');

  // Payload is authenticated. The current client still uses polling, so we
  // acknowledge events without logging customer IDs or message content.
  return text('EVENT_RECEIVED');
}

export default { fetch: handleRequest };
