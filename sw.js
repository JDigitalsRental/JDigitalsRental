/* JDigitalsRental PWA — v2. Offline shell only; live data stays online. */
const CACHE_NAME = 'jdr-shell-v2';
const BASE = new URL('./', self.registration.scope);
const OFFLINE_URL = BASE.href;
const PRECACHE = [
  OFFLINE_URL,
  new URL('styles.css?v=33', BASE).href,
  new URL('assets/jdigitals-logo.png', BASE).href
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => Promise.allSettled(PRECACHE.map(url => cache.add(url)))));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('jdr-shell-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE.pathname)) return;
  if (url.pathname.endsWith('/admin.html') ||
      url.pathname.endsWith('/app.js') ||
      url.pathname.endsWith('/details.js')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }));
  }
});
