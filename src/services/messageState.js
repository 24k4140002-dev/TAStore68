export function createOptimisticMessage({ id, text, createdAt, pageId, pageName }) {
  return {
    id,
    message: text,
    created_time: createdAt,
    from: { id: pageId, name: pageName },
    sending: true
  };
}

export function confirmOptimisticMessage(messages, tempId, response = {}) {
  return messages.map(message => {
    if (message.id !== tempId) return message;
    return {
      ...message,
      id: response.message_id || message.id,
      sending: false
    };
  });
}

export function removeOptimisticMessage(messages, tempId) {
  return messages.filter(message => message.id !== tempId);
}

export function isConversationRequestCurrent({
  activeConversationId,
  conversationId,
  currentRequestId,
  requestId
}) {
  return String(activeConversationId || '') === String(conversationId || '')
    && Number(currentRequestId) === Number(requestId);
}

export function mergeMessageWindow(existingMessages, latestMessages) {
  const latestIds = new Set(latestMessages.map(message => message.id));
  const preservedHistory = existingMessages.filter(message => !latestIds.has(message.id));

  return [...preservedHistory, ...latestMessages].sort((a, b) => (
    new Date(a.created_time || 0).getTime() - new Date(b.created_time || 0).getTime()
  ));
}
