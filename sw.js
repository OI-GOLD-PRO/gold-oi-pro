// OI Gold Pro: ดูแลการเปิดหน้าแอปและการแจ้งเตือน Web Push
self.addEventListener('install', () => self.skipWaiting());
const scope = new URL(self.registration.scope);
const isAppPage = url => url.origin === scope.origin &&
  (url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html');

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window' });
    for (const client of windows) {
      const url = new URL(client.url);
      if (!isAppPage(url) || url.searchParams.get('pane') === 'b' ||
          url.searchParams.has('vc')) continue;
      // กู้หน้าที่เปิดค้างก่อนมีตัวตรวจเวอร์ชัน โดยคงพารามิเตอร์เดิม
      url.searchParams.set('vc', String(Date.now()));
      // Navigation can wait on activation, so do not await it here.
      client.navigate(url.href).catch(() => {});
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.mode !== 'navigate' || !isAppPage(new URL(request.url))) return;
  event.respondWith((async () => {
    try {
      return await fetch(request, { cache: 'no-store' });
    } catch (error) {
      return fetch(request, { cache: 'force-cache' });
    }
  })());
});
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'OI Gold Pro', body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'OI Gold Pro';
  e.waitUntil((async () => {
    await self.registration.showNotification(title, { body: d.body || '', tag: d.tag || undefined, icon: 'icon-192.png', badge: 'icon-192.png', renotify: true, vibrate: [200, 100, 200], data: { url: './' } });
    // ถ้าแอปเปิดอยู่ ให้แอปส่งเสียงเตือนด้วย
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cs.forEach(c => c.postMessage({ type: 'oi-push', title, body: d.body || '' }));
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (cs.length) return cs[0].focus();
    return self.clients.openWindow('./');
  })());
});
