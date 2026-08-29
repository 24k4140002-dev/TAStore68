export const MESSAGE_CACHE_PREFIX = 'metapost_msgs_';
export const MESSAGE_CACHE_INDEX_KEY = 'metapost_message_cache_index';
export const MAX_CACHED_MESSAGES = 60;
export const MAX_CACHED_CONVERSATIONS = 24;

function getDefaultPersistentStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function getDefaultSessionStorage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

function readIndex(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(MESSAGE_CACHE_INDEX_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function listCachedConversationIds(storage) {
  const ids = [];
  if (!storage) return ids;
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(MESSAGE_CACHE_PREFIX)) {
        ids.push(key.slice(MESSAGE_CACHE_PREFIX.length));
      }
    }
  } catch {}
  return ids;
}

function removeCachedConversation(storage, conversationId, index) {
  try {
    storage.removeItem(`${MESSAGE_CACHE_PREFIX}${conversationId}`);
  } catch {}
  delete index[conversationId];
}

function writeIndex(storage, index) {
  try {
    storage.setItem(MESSAGE_CACHE_INDEX_KEY, JSON.stringify(index));
  } catch {
    // The message payload is more important than the optional LRU metadata.
  }
}

function persistToStorage(storage, conversationId, payload, now, maxConversations) {
  if (!storage) return false;

  const index = readIndex(storage);
  const existingIds = listCachedConversationIds(storage);
  existingIds.forEach(id => {
    if (!Number.isFinite(Number(index[id]))) index[id] = 0;
  });
  index[conversationId] = now;

  const orderedIds = [...new Set([...existingIds, conversationId])]
    .sort((left, right) => Number(index[right] || 0) - Number(index[left] || 0));
  orderedIds.slice(maxConversations).forEach(id => removeCachedConversation(storage, id, index));

  const key = `${MESSAGE_CACHE_PREFIX}${conversationId}`;
  try {
    storage.setItem(key, payload);
    writeIndex(storage, index);
    return true;
  } catch {
    // Storage quota is shared with settings and Inbox data. Evict only old
    // recoverable message snapshots, then retry without surfacing a fake Meta
    // load/send error to the operator.
  }

  const evictionCandidates = listCachedConversationIds(storage)
    .filter(id => id !== conversationId)
    .sort((left, right) => Number(index[left] || 0) - Number(index[right] || 0));

  for (const staleId of evictionCandidates) {
    removeCachedConversation(storage, staleId, index);
    try {
      storage.setItem(key, payload);
      writeIndex(storage, index);
      return true;
    } catch {
      // Keep evicting only message snapshots until the bounded payload fits.
    }
  }

  return false;
}

export function setCacheItemWithMessageEviction(storage, key, value) {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    // Inbox snapshots are also recoverable. If shared browser storage is full,
    // reclaim older message snapshots before giving up on the newest list.
  }

  const index = readIndex(storage);
  const evictionCandidates = listCachedConversationIds(storage)
    .sort((left, right) => Number(index[left] || 0) - Number(index[right] || 0));
  for (const staleId of evictionCandidates) {
    removeCachedConversation(storage, staleId, index);
    try {
      storage.setItem(key, value);
      writeIndex(storage, index);
      return true;
    } catch {
      // Keep trying after evicting only recoverable message snapshots.
    }
  }
  return false;
}

export function trimMessagesForCache(messages, maxMessages = MAX_CACHED_MESSAGES) {
  if (!Array.isArray(messages)) return [];
  const safeLimit = Math.max(1, Number(maxMessages) || MAX_CACHED_MESSAGES);
  return messages.length > safeLimit ? messages.slice(-safeLimit) : messages;
}

export function readMessageCache(
  conversationId,
  {
    persistentStorage = getDefaultPersistentStorage(),
    sessionStorageLike = getDefaultSessionStorage(),
    maxMessages = MAX_CACHED_MESSAGES
  } = {}
) {
  const key = `${MESSAGE_CACHE_PREFIX}${conversationId}`;
  for (const storage of [persistentStorage, sessionStorageLike]) {
    if (!storage) continue;
    try {
      const parsed = JSON.parse(storage.getItem(key) || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return trimMessagesForCache(parsed, maxMessages);
      }
    } catch {
      // Try the next storage tier when one snapshot is malformed.
    }
  }
  return [];
}

export function persistMessageCache(
  conversationId,
  messages,
  {
    persistentStorage = getDefaultPersistentStorage(),
    sessionStorageLike = getDefaultSessionStorage(),
    maxMessages = MAX_CACHED_MESSAGES,
    maxConversations = MAX_CACHED_CONVERSATIONS,
    now = Date.now()
  } = {}
) {
  const cachedMessages = trimMessagesForCache(messages, maxMessages);
  const payload = JSON.stringify(cachedMessages);
  const persistent = persistToStorage(
    persistentStorage,
    String(conversationId || ''),
    payload,
    Number(now),
    Math.max(1, Number(maxConversations) || MAX_CACHED_CONVERSATIONS)
  );
  const session = persistToStorage(
    sessionStorageLike,
    String(conversationId || ''),
    payload,
    Number(now),
    Math.max(1, Number(maxConversations) || MAX_CACHED_CONVERSATIONS)
  );
  return { cachedMessages, persistent, session };
}
