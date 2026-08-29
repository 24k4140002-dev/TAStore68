import { checkPushStorage, getPushConfig, json } from '../_lib/push.js';

async function handleRequest(request) {
  if (request.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405);
  const config = getPushConfig();
  if (!config.ready) return json({ error: 'Thông báo nền chưa được cấu hình' }, 503);
  try {
    await checkPushStorage();
  } catch {
    return json({ error: 'Kho thông báo chưa sẵn sàng' }, 503);
  }
  return json({ publicKey: config.publicKey });
}

export default { fetch: handleRequest };
