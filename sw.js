/**
 * Кэширует оболочку приложения, чтобы оно открывалось без интернета.
 * Данные пользователя здесь не участвуют — они лежат в localStorage.
 *
 * При выпуске обновлений поднимайте CACHE_VERSION, иначе на телефоне
 * останется старая версия из кэша.
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = `payments-counter-${CACHE_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/analytics.js',
  './js/export.js',
  './js/methods.js',
  './js/money.js',
  './js/store.js',
  './js/components/chart.js',
  './js/components/dom.js',
  './js/components/toast.js',
  './js/components/totals.js',
  './js/views/entry.js',
  './js/views/history.js',
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
