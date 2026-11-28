const CACHE_NAME = 'elder-med-pwa-v51';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 允許快取離線掃碼與 PaddleOCR ONNX 引擎（jsQR、onnxruntime-web 的 .js 與 .wasm）
  const isOfflineOcrCdn =
    (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'unpkg.com') &&
    /(?:jsqr|onnxruntime-web)/i.test(url.pathname);
  if (url.origin !== self.location.origin && !isOfflineOcrCdn) return;

  // PaddleOCR 模型檔（./models/*.onnx, keys.txt）與 ONNX Runtime WASM：Cache-First（載入一次永久離線秒開，不重複消耗行動網路）
  const isImmutableModelOrWasm =
    /\/models\/.*\.(?:onnx|txt)$/i.test(url.pathname) ||
    isOfflineOcrCdn;
  if (isImmutableModelOrWasm) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  const isHtmlOrIndex =
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('tfda_drugs_manifest.json') ||
    url.pathname.endsWith('tfda_drugs_index.json');

  if (isHtmlOrIndex) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
