export const INBOX_PUSH_EVENT = 'metapost-inbox-push';

export function normalizePushSignal(data) {
  if (data?.type !== 'PUSH_DELIVERED' || !/^\d+$/.test(String(data.pageId || ''))) return null;
  return {
    pageId: String(data.pageId),
    convId: String(data.convId || ''),
    senderPsid: String(data.senderPsid || ''),
    messageId: String(data.messageId || '')
  };
}

export function matchesActiveThread(signal, conversation) {
  if (!signal || !conversation || String(conversation.page_id) !== signal.pageId) return false;
  if (signal.convId) return signal.convId === String(conversation.fb_conversation_id);
  if (signal.senderPsid) return signal.senderPsid === String(conversation.customer_psid);
  return true; // Compatibility with older service workers sending only Page ID.
}

// Coalesce bursts, retaining one trailing run for events received in flight.
export function createSyncQueue(task, {
  minGapMs = 1200, now = () => Date.now(),
  setTimer = setTimeout, clearTimer = clearTimeout, onError = () => {}
} = {}) {
  let disposed = false, running = false, pending = false, timer = null;
  let lastStart = -Infinity;
  const schedule = () => {
    if (disposed || running || timer !== null || !pending) return;
    timer = setTimer(run, Math.max(0, minGapMs - (now() - lastStart)));
  };
  const run = async () => {
    timer = null;
    if (disposed || !pending) return;
    pending = false;
    running = true;
    lastStart = now();
    try { await task(); } catch (error) { onError(error); }
    finally { running = false; schedule(); }
  };
  return {
    request() { if (!disposed) { pending = true; schedule(); } },
    dispose() { disposed = true; pending = false; if (timer !== null) clearTimer(timer); timer = null; }
  };
}
