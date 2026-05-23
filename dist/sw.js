// Swindon Airsoft — Push Notification Service Worker v3
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
      body:      data.body,
      icon:      '/src/logo_transparent.PNG',
      badge:     '/src/logo_transparent.PNG',
      tag:       'sa-' + Date.now(),
      data:      { url: data.url },
      actions: [
        { action: 'open',  title: 'View' },
        { action: 'close', title: 'Dismiss' },
      ],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;

  const path    = event.notification.data?.url || '/';
  const fullUrl = self.location.origin + (path.startsWith('/') ? path : '/' + path);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Find an existing tab on our site
      const existing = clients.find(c => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        existing.postMessage({ type: 'NAVIGATE', url: path });
        return;
      }
      return self.clients.openWindow(fullUrl);
    })
  );
});
