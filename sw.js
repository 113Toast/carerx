const CACHE_NAME = 'elder-med-pwa-v47';
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
  // 允許快取離線 OCR／QR 掃碼用的靜態 CDN 套件（jsQR、Tesseract.js 與 eng 模型），讓第一次載入後即可完全離線使用；其餘外部 API 直接走網路
  const isOfflineOcrCdn =
    (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'tessdata.projectnaptha.com') &&
    /(?:jsqr|tesseract|eng\.traineddata)/i.test(url.pathname);
  if (url.origin !== self.location.origin && !isOfflineOcrCdn) return;

  const isHtmlOrIndex =
    req.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('tfda_drugs_manifest.json') ||
    url.pathname.endsWith('tfda_drugs_index.json');

  if (isHtmlOrIndex) {
    // Network-First：確保連網時總是取得最新網頁與藥品目錄，離線時自動回退快取
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

  // 其他同源靜態資源與藥品資料分片：Stale-While-Revalidate
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
