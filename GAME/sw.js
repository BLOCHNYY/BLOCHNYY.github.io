const CACHE_NAME = 'blochnyy-cache-v3';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './noise.js',
  './localforage.min.js',
  './supabase.min.js',
  '../assets/logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      }).catch(() => {
        // Fallback for offline if not in cache
      })
  );
});
