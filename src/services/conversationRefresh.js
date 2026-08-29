export function preserveFailedPageConversations(fresh, previous, failedPageIds) {
  const failed = new Set(failedPageIds.map(String));
  const present = new Set(fresh.map(item => `${item.page_id}:${item.fb_conversation_id}`));
  return [...fresh, ...previous.filter(item => failed.has(String(item.page_id))
    && !present.has(`${item.page_id}:${item.fb_conversation_id}`))];
}

export function mergeRefreshedPageConversations(fresh, previous, targetPageIds) {
  const target = new Set((targetPageIds || []).map(String));
  const merged = new Map();

  for (const conversation of fresh || []) {
    merged.set(`${conversation.page_id}:${conversation.fb_conversation_id}`, conversation);
  }
  for (const conversation of previous || []) {
    if (!target.has(String(conversation.page_id))) continue;
    const key = `${conversation.page_id}:${conversation.fb_conversation_id}`;
    if (!merged.has(key)) merged.set(key, conversation);
  }

  return [...merged.values()];
}
