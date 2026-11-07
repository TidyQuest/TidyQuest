/*
 * TidyQuest's service worker (NEW-5): shows web push notifications and opens the app when one is tapped.
 * It caches nothing, so the app always loads fresh from the server. Registered only on a device where someone
 * turned notifications on (Profile → My notifications → This device).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { body: event.data ? event.data.text() : '' };
    }
    event.waitUntil(
        self.registration.showNotification(data.title || 'TidyQuest', {
            body: data.body || '',
            icon: '/icon-192.png',
            badge: '/transparent-icon.png',
            data: { url: data.url || './' },
        }),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
    event.waitUntil(
        (async () => {
            // Bring the app forward if it's already open; otherwise open it
            const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
            const app = open.find((c) => c.url.startsWith(self.registration.scope));
            if (app) return app.focus();
            return self.clients.openWindow(target);
        })(),
    );
});
