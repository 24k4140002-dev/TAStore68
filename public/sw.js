// TAStore68 Pro — Service Worker for Web Push & Lock Screen Notifications
const CACHE_NAME = 'tastore68-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
  const options = {
    body: payload.body || 'Khách hàng vừa gửi tin nhắn',
    icon: payload.icon || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='25' fill='%232563eb'/><text x='50%' y='65%' font-size='50' font-weight='900' fill='white' text-anchor='middle' font-family='sans-serif'>TA</text></svg>",
    badge: payload.badge || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='45' fill='%232563eb'/></svg>",
    data: payload.data || {},
    vibrate: [200, 100, 200],
    tag: payload.data?.convId ? `chat-${payload.data.convId}` : 'chat-general',
    renotify: true,
    requireInteraction: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle Notification Click (Deep-Linking directly to Customer Chat & Page)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const pageId = data.pageId || 'all';
  const convId = data.convId || '';
  const targetUrl = `/?pageId=${encodeURIComponent(pageId)}&convId=${encodeURIComponent(convId)}`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If app window is already open, focus it and dispatch message
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NAVIGATE_TO_CONVERSATION',
            pageId,
            convId
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
