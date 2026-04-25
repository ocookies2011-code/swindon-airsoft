// Swindon Airsoft — Push Notification Service Worker
const CACHE_NAME = 'sa-sw-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = { title: 'Swindon Airsoft', body: 'New update', url: '/' };
  try { data = event.data?.json() || data; } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: 'sa-notification',
      renotify: true,
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

  const targetUrl = event.notification.data?.url || '/';
  const fullUrl = self.location.origin + targetUrl;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // If site is already open, focus it and navigate to the right page
      const existing = clients.find(c => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        // Navigate to the hash route
        return existing.navigate(fullUrl);
      }
      // Otherwise open a new window
      return self.clients.openWindow(fullUrl);
    })
  );
});
