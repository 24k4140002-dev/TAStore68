const DEFAULT_LEASE_MS = 180_000;

function getDefaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function createOwnerToken() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Run one Meta background sync across all open tabs/windows.
 * Web Locks is authoritative where supported. Safari falls back to a short
 * localStorage lease so a Home Screen shortcut and Safari tab do not both poll.
 */
export async function runWithCrossTabSyncLock(
  lockName,
  task,
  {
    navigatorLike = typeof navigator !== 'undefined' ? navigator : null,
    storage = getDefaultStorage(),
    leaseMs = DEFAULT_LEASE_MS,
    now = () => Date.now()
  } = {}
) {
  if (typeof task !== 'function') return null;

  if (navigatorLike?.locks?.request) {
    return navigatorLike.locks.request(
      lockName,
      { mode: 'exclusive', ifAvailable: true },
      lock => (lock ? task() : null)
    );
  }

  if (!storage) return task();

  const leaseKey = `metapost_sync_lock_${lockName}`;
  const owner = createOwnerToken();
  const startedAt = now();
  let ownsLease = false;
  try {
    const current = JSON.parse(storage.getItem(leaseKey) || 'null');
    if (current?.owner && Number(current.expiresAt || 0) > startedAt) return null;

    storage.setItem(leaseKey, JSON.stringify({ owner, expiresAt: startedAt + leaseMs }));
    const claimed = JSON.parse(storage.getItem(leaseKey) || 'null');
    if (claimed?.owner !== owner) return null;
    ownsLease = true;
  } catch {
    // Restricted/private storage must not stop Inbox refresh entirely.
    return task();
  }

  try {
    return await task();
  } finally {
    if (ownsLease) {
      try {
        const current = JSON.parse(storage.getItem(leaseKey) || 'null');
        if (current?.owner === owner) storage.removeItem(leaseKey);
      } catch {}
    }
  }
}
