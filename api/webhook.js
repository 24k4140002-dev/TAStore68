import crypto from 'node:crypto';
import { sendPageMessagePush } from './_lib/push.js';

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
  if (Buffer.byteLength(rawBody, 'utf8') > 1_048_576) return text('Payload too large', 413);
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

  const jobs = [];
  for (const entry of payload.entry || []) {
    const pageId = String(entry?.id || '');
    if (!/^\d+$/.test(pageId)) continue;
    // Meta delivers messages in standby while another app owns the thread.
    // Handle both without taking control or sending anything to the customer.
    const events = [...(Array.isArray(entry.messaging) ? entry.messaging : []),
      ...(Array.isArray(entry.standby) ? entry.standby : [])];
    for (const event of events) {
      if (!event?.message?.mid || event.message.is_echo) continue;
      jobs.push(sendPageMessagePush({
        pageId,
        senderPsid: event.sender?.id,
        message: event.message
      }));
    }
  }
  // Meta retries webhook deliveries. Message IDs are claimed in storage before
  // sending, while individual push failures never make Meta retry the whole batch.
  const outcomes = await Promise.allSettled(jobs);
  const deliverySummary = outcomes.reduce((summary, outcome) => {
    if (outcome.status === 'rejected') {
      summary.jobsFailed += 1;
      return summary;
    }
    summary.attempted += Number(outcome.value?.attempted || 0);
    summary.sent += Number(outcome.value?.sent || 0);
    summary.failed += Number(outcome.value?.failed || 0);
    summary.expired += Number(outcome.value?.expired || 0);
    summary.retryableFailures += Number(outcome.value?.retryableFailures || 0);
    if (outcome.value?.duplicate) summary.duplicates += 1;
    return summary;
  }, { events: jobs.length, attempted: 0, sent: 0, failed: 0, expired: 0, retryableFailures: 0, duplicates: 0, jobsFailed: 0 });
  // No message bodies, customer IDs, tokens or endpoints are written to logs.
  console.info(JSON.stringify({ event: 'meta_webhook_push', ...deliverySummary }));
  if (deliverySummary.jobsFailed > 0 || deliverySummary.retryableFailures > 0) {
    return text('Temporary delivery failure', 503);
  }
  return text('EVENT_RECEIVED');
}

export default { fetch: handleRequest };
