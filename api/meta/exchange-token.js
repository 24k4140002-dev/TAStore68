export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { shortToken, appId: customAppId, appSecret: customAppSecret } = req.body || {};
    const cleanShort = (shortToken || '').trim();

    if (!cleanShort) {
      return res.status(400).json({ error: 'Vui lòng cung cấp User Token ngắn hạn.' });
    }

    // Read App ID & Secret from server environment variables, or fallback to request body
    const appId = process.env.META_APP_ID || customAppId;
    const appSecret = process.env.META_APP_SECRET || customAppSecret;
    const version = process.env.META_GRAPH_VERSION || 'v19.0';

    if (!appId || !appSecret) {
      return res.status(400).json({
        error: 'Chưa cấu hình META_APP_ID hoặc META_APP_SECRET trên máy chủ Vercel. Vui lòng thêm biến môi trường trong Vercel Project Settings.'
      });
    }

    const exchangeUrl = https://graph.facebook.com/\/oauth/access_token?grant_type=fb_exchange_token&client_id=\&client_secret=\&fb_exchange_token=\;

    const response = await fetch(exchangeUrl);
    const data = await response.json();

    if (!response.ok || data.error) {
      return res.status(response.status || 400).json({
        error: data?.error?.message || 'Không thể đổi Token với Meta Graph API.',
        meta_error: data?.error
      });
    }

    return res.status(200).json({
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi máy chủ: ' + err.message });
  }
}
