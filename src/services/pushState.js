// A successful test push or a webhook for another Page is not proof that this
// Page's real messages reach this device.
export function shouldUseServerPush({ enabled, permission, pageId, receivedPages = {}, now = Date.now() }) {
  const lastReceived = Number(receivedPages[pageId] || 0);
  return enabled === true && permission === 'granted' && lastReceived > 0
    && now >= lastReceived && now - lastReceived < 24 * 60 * 60_000;
}

export function getPushHealth({ failedCount = 0, callbackReady = true, received = false }) {
  if (failedCount > 0 || !callbackReady) return 'partial';
  return received ? 'ready' : 'waiting';
}

export const PUSH_REGISTRATION_COOLDOWN_MS = 6 * 60 * 60_000;
export const PUSH_PAGE_SELECTION_CHANGED_EVENT = 'metapost-push-page-selection-changed';

export function shouldRefreshPushRegistration({
  enabled,
  permission,
  hasSubscription,
  lastRegisteredAt,
  storedSelectionSignature,
  currentSelectionSignature,
  now = Date.now(),
  cooldownMs = PUSH_REGISTRATION_COOLDOWN_MS
}) {
  if (!enabled || permission !== 'granted' || !hasSubscription) return true;
  if (!currentSelectionSignature || storedSelectionSignature !== currentSelectionSignature) return true;
  const registeredAt = Number(lastRegisteredAt || 0);
  if (!Number.isFinite(registeredAt) || registeredAt <= 0 || registeredAt > now) return true;
  return now - registeredAt >= cooldownMs;
}
