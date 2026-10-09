// Service worker: aplikace se načte i offline, data jdou vždy nejdřív ze sítě.
const VERSION = 'mraq-v22';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'mraq.js', 'intro.js', 'hlasky.txt', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/mraq.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // API počasí a radar: síť, nic necachovat (appka si poslední data drží sama)
  if (/open-meteo|rainviewer|bigdatacloud|arcgisonline/.test(url.hostname)) return;
  // Fonty a Leaflet: cache-first
  if (/fonts\.(googleapis|gstatic)|cdnjs/.test(url.hostname)) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res;
    })));
    return;
  }
  // Vlastní soubory: síť napřed (ať se hned projeví úpravy), offline z cache
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
  }
});

// Notifikace od Mraqa (posílá je server mraq-push)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Mraq', {
    body: d.body || '', tag: d.tag || 'mraq', renotify: true,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.location.href).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list.find((w) => w.url.startsWith(self.registration.scope));
    return c ? c.focus() : clients.openWindow(url);
  }));
});
