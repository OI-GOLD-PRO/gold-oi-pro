// OI Gold Pro: Service Worker สำหรับแจ้งเตือน Web Push เท่านั้น (ไม่แคชไฟล์ ไม่ยุ่งกับการโหลดหน้า)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
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
