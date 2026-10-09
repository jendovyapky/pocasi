// Service worker: aplikace se načte i offline, data jdou vždy nejdřív ze sítě.
const VERSION = 'mraq-v5';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'mraq.js', 'hlasky.txt', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/mraq.svg'];

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
