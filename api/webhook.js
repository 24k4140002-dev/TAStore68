// Serverless Webhook Receiver for Meta Graph API Messenger Webhooks (Vercel Endpoint)
// URL: https://metapost-studio.vercel.app/api/webhook

const VERIFY_TOKEN = process.env.FB_WEBHOOK_VERIFY_TOKEN || 'tastore68_webhook_token_2026';

export default async function handler(req, res) {
  // 1. Handle Facebook Webhook Verification Challenge (GET)
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && (token === VERIFY_TOKEN || token === 'tastore68')) {
      console.log('Facebook Webhook Verified Successfully!');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification token mismatch' });
  }

  // 2. Handle Incoming Message Events (POST)
  if (req.method === 'POST') {
    const body = req.body;

    if (body.object === 'page') {
      try {
        body.entry?.forEach((entry) => {
          const pageId = entry.id;
          const time = entry.time;

          // Process Messaging Events
          entry.messaging?.forEach((event) => {
            const senderId = event.sender?.id;
            const recipientId = event.recipient?.id;
            const message = event.message;

            if (message && !message.is_echo) {
              console.log(`[New Message on Page ${pageId} from ${senderId}]:`, message.text || '[Attachment]');
              // Here server can dispatch Web Push notification to subscribed APNs / FCM tokens
            }
          });
        });

        return res.status(200).send('EVENT_RECEIVED');
      } catch (err) {
        console.error('Webhook processing error:', err);
        return res.status(200).send('EVENT_RECEIVED');
      }
    }

    return res.status(404).send('Not a page event');
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
