/* Service Worker do Leitura — offline-first com atualização pela rede */
const CACHE = 'leitura-v3';
const SHELL = [
  './',
  './index.html',
  './app.html',
  './img/capas/capa-1.jpg',
  './img/capas/capa-2.jpg',
  './img/capas/capa-3.jpg',
  './img/capas/capa-4.jpg',
  './img/capas/capa-5.jpg',
  './img/capas/capa-6.jpg',
  './img/capas/capa-7.jpg',
  './css/styles.css',
  './js/db.js',
  './js/text.js',
  './js/readers.js',
  './js/app.js',
  './lib/pdf.min.js',
  './lib/jszip.min.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(SHELL.map(u => c.add(u).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => hit || caches.match('./index.html'))
      )
  );
});
