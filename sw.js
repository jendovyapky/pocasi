// Service worker: appka startuje okamžitě z cache (žádná černá obrazovka), na pozadí si stáhne novou verzi → projeví se při dalším otevření.
const VERSION = 'mraq-v27';
const SHELL = ['./', 'style.css', 'app.js', 'mraq.js', 'intro.js', 'hlasky.txt', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/mraq.svg'];

// Cloudflare Pages přesměrovává /index.html → / . Safari odmítne stránku, kterou service worker vrátí
// jako „přesměrovanou“ odpověď („Response served by service worker has redirections“) → ukládat a vracet jen čisté kopie.
const clean = (res) => (res && res.redirected
  ? res.blob().then((b) => new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers }))
  : Promise.resolve(res));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) =>
    fetch(new Request(u, { cache: 'reload' })).then(clean).then((res) => { if (res.ok) return c.put(u, res); }))))
    .then(() => self.skipWaiting()));
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
  // Vlastní soubory: hned z cache (rychlý start), zároveň se stáhne čerstvá verze do cache na příště.
  // Co v cache není, jde ze sítě.
  if (url.origin === location.origin) {
    const nav = e.request.mode === 'navigate';
    const key = nav ? './' : e.request;
    const fresh = fetch(e.request, { cache: 'no-cache' }).then(clean).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
      return res;
    });
    e.waitUntil(fresh.catch(() => {}));
    e.respondWith(caches.match(key, { ignoreSearch: nav }).then((r) => (r ? clean(r) : fresh)).catch(() => caches.match('./').then(clean)));
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
