// Swindon Airsoft — Push Notification Service Worker v2
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = { title: 'Swindon Airsoft', body: 'You have a new notification', url: '/' };
  try {
    const parsed = event.data?.json();
    if (parsed) data = { ...data, ...parsed };
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: 'sa-' + Date.now(), // unique tag so each notification shows separately
      data: { url: data.url },
      actions: [
        { action: 'open', title: 'View' },
        { action: 'close', title: 'Dismiss' },
      ],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;

  const path = event.notification.data?.url || '/';
  // Always use the origin, append the path (handles hash routes like /#events)
  const fullUrl = self.location.origin + (path.startsWith('/') ? path : '/' + path);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Look for an existing tab on our site
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url: path });
          return;
        }
      }
      // No existing tab — open a new one
      return self.clients.openWindow(fullUrl);
    })
  );
});
