const CACHE_NAME = 'panchanga-v3';
const ASSETS = ['./index.html', './astro.js', './idb.js', './manifest.json', './icon-192.png', './icon-512.png'];

importScripts('astro.js', 'idb.js');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for the app shell so updates show up quickly; falls back to cache when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ---------- Push notifications (Reminders) ----------
// The push payload from the Worker is intentionally content-free (just a wake-up
// signal, no personal data). Everything below runs on-device: read the saved
// location + watchlist from IndexedDB, compute today's panchanga with the same
// astro.js engine the page uses, and only show a notification if something matches.
self.addEventListener('push', (e) => {
  e.waitUntil(handlePush());
});

async function handlePush(){
  try{
    const loc = await self.PanchangaIDB.get('location');
    const watchlist = await self.PanchangaIDB.get('watchlist');
    if(!loc || !watchlist){ return; }

    const civilDate = self.PanchangaAstro.todayCivilInTz(loc.tz);
    const p = self.PanchangaAstro.computePanchanga(civilDate.y, civilDate.m, civilDate.d, loc.lat, loc.lon, loc.tz);
    const matches = self.PanchangaAstro.matchWatchlist(p, civilDate, watchlist);

    if(matches.length === 0){
      // A push event must produce a visible notification; show one and close it immediately.
      await self.registration.showNotification(' ', { silent: true, tag: 'panchanga-silent' });
      return;
    }

    await self.registration.showNotification('Panchanga', {
      body: matches.join(' • '),
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'panchanga-reminder'
    });
  }catch(err){
    // Still must show something, or the browser may disable future pushes for this app.
    await self.registration.showNotification('Panchanga', { body: 'Could not check today’s panchanga.', icon: 'icon-192.png' });
  }
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const existing = clientsArr.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
