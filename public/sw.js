// TAStore68 Pro — Service Worker for Web Push & Lock Screen Notifications
const CACHE_NAME = 'tastore68-v6';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Handle Incoming Web Push Notifications (From Apple APNs / FCM)
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Tin nhắn mới từ Fanpage',
    body: 'Khách hàng vừa gửi tin nhắn mới',
    data: { pageId: 'all', convId: '' }
  };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text();
    }
  }

  const title = payload.title || 'TAStore68 — Tin nhắn mới';
  const notificationData = payload.data || {};
  const pageId = notificationData.pageId || 'all';
  const conversationKey = notificationData.convId || notificationData.senderPsid || 'new';
  const options = {
    body: payload.body || 'Khách hàng vừa gửi tin nhắn',
    icon: payload.icon || '/icon.svg',
    badge: payload.badge || '/badge.svg',
    data: notificationData,
    vibrate: [200, 100, 200],
    // Keep one visible notification per customer conversation. A newer message
    // replaces the previous card but renotify still asks the OS to alert again.
    tag: notificationData.kind === 'setup'
      ? 'metapost-push-ready'
      : `chat-${pageId}-${conversationKey}`,
    renotify: true,
    requireInteraction: false,
    silent: false
  };

  event.waitUntil(self.registration.showNotification(title, options).then(() => (
    notificationData.kind === 'setup'
      ? Promise.resolve()
      : self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
          clientList.forEach(client => client.postMessage({ type: 'PUSH_DELIVERED', pageId }));
        })
  )));
});

// Handle Notification Click (Deep-Linking directly to Customer Chat & Page)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const pageId = data.pageId || 'all';
  const convId = data.convId || '';
  const senderPsid = data.senderPsid || '';
  const targetUrl = `/?pageId=${encodeURIComponent(pageId)}&convId=${encodeURIComponent(convId)}&senderPsid=${encodeURIComponent(senderPsid)}`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app window is already open, focus it and dispatch message
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NAVIGATE_TO_CONVERSATION',
            pageId,
            convId,
            senderPsid
          });
          return client.focus();
        }
      }
      // If app is closed, open it directly to the target URL
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
