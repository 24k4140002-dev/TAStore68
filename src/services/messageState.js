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
