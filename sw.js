/**
 * Кэширует оболочку приложения, чтобы оно быстро открывалось и не зависело
 * от скорости сети. Сами оплаты через кэш не проходят: они лежат в Google
 * Таблице, а запросы к ней уходят на другой домен и здесь не перехватываются.
 *
 * При выпуске обновлений поднимайте CACHE_VERSION, иначе на телефоне
 * останется старая версия из кэша.
 */
const CACHE_VERSION = 'v8';
const CACHE_NAME = `payments-counter-${CACHE_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/analytics.js',
  './js/api.js',
  './js/config.js',
  './js/methods.js',
  './js/money.js',
  './js/store.js',
  './js/components/confirm.js',
  './js/components/dom.js',
  './js/components/payment-rows.js',
  './js/components/toast.js',
  './js/components/totals.js',
  './js/views/entry.js',
  './js/views/history.js',
  './js/views/setup.js',
  './js/views/stats.js',
  './assets/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // addAll падает целиком, если хоть один файл недоступен — кэшируем по одному.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Сеть в приоритете: так обновления долетают сразу, а кэш остаётся страховкой.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      }),
  );
});
