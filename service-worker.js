/* ReelMaker Service Worker - Offline-first PWA Cache */
const CACHE_NAME = 'reelmaker-v1.0.6';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './css/editor.css',
  './css/timeline.css',
  './css/responsive.css',
  './js/utils.js',
  './js/state.js',
  './js/presets.js',
  './js/project-storage.js',
  './js/canvas-renderer.js',
  './js/text-editor.js',
  './js/background-editor.js',
  './js/timeline.js',
  './js/audio-engine.js',
  './js/video-exporter.js',
  './js/app.js',
  './assets/fonts/HindSiliguri-Regular.ttf',
  './assets/fonts/HindSiliguri-Bold.ttf',
  './assets/fonts/NotoSansBengali.ttf',
  './assets/fonts/NotoSerifBengali.ttf',
  './assets/fonts/Outfit.ttf',
  './assets/fonts/OFL.txt',
  './assets/patterns/doodle-hearts.svg',
  './assets/patterns/doodle-stars.svg',
  './assets/patterns/doodle-music.svg',
  './assets/patterns/doodle-botanical.svg',
  './assets/patterns/doodle-geometric.svg',
  './assets/patterns/paper-dots.svg',
  './assets/backgrounds/cream-paper.svg',
  './assets/backgrounds/dark-obsidian.svg',
  './assets/backgrounds/pastel-rose.svg',
  './assets/music/lofi-peace-15s.wav',
  './assets/music/sad-acoustic-15s.wav',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './workers/export-worker.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use individual caching to prevent a single missing asset from failing the whole install
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.warn(`[ServiceWorker] Could not cache asset: ${url}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log(`[ServiceWorker] Removing old cache: ${name}`);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Ignore non-GET requests and internal schemes like blob/data
  if (event.request.method !== 'GET' || requestUrl.protocol.startsWith('chrome-extension')) {
    return;
  }

  // Cache-first strategy for app shell and bundled assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        // Cache valid same-origin responses
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for HTML navigation requests when completely offline
        if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
