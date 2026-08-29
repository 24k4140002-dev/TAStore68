export function getConversationReadMarker(conversation = {}) {
  return String(
    conversation.last_message_id
      || `${conversation.last_message_at || ''}:${conversation.snippet || ''}`
  );
}

export function createReadCandidate(conversation = {}) {
  return {
    conversationId: String(conversation.fb_conversation_id || conversation.id || ''),
    pageId: String(conversation.page_id || ''),
    marker: getConversationReadMarker(conversation),
    unreadCount: Number(conversation.unread_count || 0)
  };
}

export function collectConfirmedReadCandidates(candidates = [], settledResults = []) {
  return candidates.filter((candidate, index) => (
    settledResults[index]?.status === 'fulfilled'
    && settledResults[index]?.value?.confirmed === true
  ));
}

export function filterCurrentReadCandidates(conversations = [], candidates = []) {
  const currentById = new Map(conversations.map(conversation => [
    String(conversation.fb_conversation_id || conversation.id || ''),
    conversation
  ]));
  return candidates.filter(candidate => {
    const current = currentById.get(candidate.conversationId);
    return current
      && Number(current.unread_count || 0) > 0
      && getConversationReadMarker(current) === candidate.marker;
  });
}

export function applyConfirmedReadsToConversations(conversations = [], confirmedCandidates = []) {
  const confirmedById = new Map(confirmedCandidates.map(candidate => [candidate.conversationId, candidate]));
  return conversations.map(conversation => {
    const conversationId = String(conversation.fb_conversation_id || conversation.id || '');
    const candidate = confirmedById.get(conversationId);
    if (!candidate || getConversationReadMarker(conversation) !== candidate.marker) return conversation;
    return {
      ...conversation,
      unread_count: 0,
      meta_unread_count: 0,
      read_sync_state: 'confirmed'
    };
  });
}

export function persistConfirmedReadsToInboxCaches(storage, confirmedCandidates = []) {
  if (!storage || confirmedCandidates.length === 0) return 0;
  const cacheKeys = [];
  for (let index = 0; index < Number(storage.length || 0); index += 1) {
    const key = storage.key(index);
    if (key === 'metapost_inbox_cache' || key?.startsWith('metapost_inbox_cache_')) {
      cacheKeys.push(key);
    }
  }

  let updatedCaches = 0;
  cacheKeys.forEach(key => {
    try {
      const cached = JSON.parse(storage.getItem(key) || '[]');
      if (!Array.isArray(cached) || cached.length === 0) return;
      const next = applyConfirmedReadsToConversations(cached, confirmedCandidates);
      const changed = next.some((conversation, index) => (
        Number(conversation.unread_count || 0) !== Number(cached[index]?.unread_count || 0)
        || conversation.read_sync_state !== cached[index]?.read_sync_state
      ));
      if (!changed) return;
      storage.setItem(key, JSON.stringify(next));
      updatedCaches += 1;
    } catch {
      // A corrupt optional cache must not block the confirmed Meta state in UI.
    }
  });
  return updatedCaches;
}

export function applyConfirmedReadsToSummary(summary, confirmedCandidates = []) {
  if (!summary || !Array.isArray(summary.perPage) || confirmedCandidates.length === 0) return summary;
  const decrementByPage = new Map();
  confirmedCandidates.forEach(candidate => {
    if (!candidate.pageId || candidate.unreadCount <= 0) return;
    decrementByPage.set(candidate.pageId, (decrementByPage.get(candidate.pageId) || 0) + 1);
  });
  const perPage = summary.perPage.map(page => ({
    ...page,
    unreadCount: Math.max(0, Number(page.unreadCount || 0) - (decrementByPage.get(String(page.pageId)) || 0))
  }));
  return {
    ...summary,
    total: perPage.reduce((sum, page) => sum + Number(page.unreadCount || 0), 0),
    perPage
  };
}
