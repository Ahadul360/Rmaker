/* ReelMaker Service Worker - Offline-first PWA Cache */
const CACHE_NAME = 'reelmaker-v2.3.4';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './apple-touch-icon.png',
  './css/styles.css',
  './css/editor.css',
  './css/timeline.css',
  './css/responsive.css',
  './js/utils.js',
  './js/state.js',
  './js/presets.js',
  './js/project-storage.js',
  './js/pattern-generator.js',
  './js/canvas-renderer.js',
  './js/text-editor.js',
  './js/background-editor.js',
  './js/timeline.js',
  './js/audio-engine.js',
  './js/aac-encoder.js',
  './js/mp4-muxer.js',
  './js/fix-webm-duration.js',
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
  './assets/patterns/doodle-butterflies.svg',
  './assets/patterns/doodle-waves.svg',
  './assets/patterns/doodle-coffee.svg',
  './assets/patterns/doodle-galaxy.svg',
  './assets/patterns/vintage-grid.svg',
  './assets/patterns/doodle-sunburst.svg',
  './assets/patterns/doodle-music.svg',
  './assets/patterns/doodle-botanical.svg',
  './assets/patterns/doodle-geometric.svg',
  './assets/patterns/paper-dots.svg',
  './assets/backgrounds/cream-paper.svg',
  './assets/backgrounds/dark-obsidian.svg',
  './assets/backgrounds/pastel-rose.svg',
  './assets/backgrounds/midnight-emerald.svg',
  './assets/backgrounds/vintage-parchment.svg',
  './assets/backgrounds/velvet-wine.svg',
  './assets/music/lofi-peace-15s.wav',
  './assets/music/sad-acoustic-15s.wav',
  './assets/music/cinematic-piano-15s.wav',
  './assets/music/deep-ambient-15s.wav',
  './assets/music/night-vibes-15s.wav',
  './assets/music/uplifting-acoustic-15s.wav',
  './assets/music/midnight-rain-15s.wav',
  './assets/music/minimal-pulse-15s.wav',
  './assets/icons/favicon.ico',
  './assets/icons/favicon.svg',
  './assets/icons/favicon-32.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/app-icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg'
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
            console.log(`[ServiceWorker] Purging old cache: ${name}`);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Ignore non-GET requests and internal browser schemes
  if (event.request.method !== 'GET' || requestUrl.protocol.startsWith('chrome-extension')) {
    return;
  }

  const urlPath = requestUrl.pathname;
  const isCodeAsset = urlPath.endsWith('.js') ||
                      urlPath.endsWith('.css') ||
                      urlPath.endsWith('.html') ||
                      urlPath.endsWith('manifest.json') ||
                      urlPath === '/' ||
                      urlPath.endsWith('/');

  if (isCodeAsset) {
    // Network-First with Cache Fallback for code assets
    // Ensures iPhone 16 Pro Max and all devices immediately receive latest scripts without stale cache locks
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
              return caches.match('./index.html');
            }
          });
        })
    );
  } else {
    // Cache-First with Network Fallback for immutable/heavy assets (fonts, audio, icons, patterns)
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
