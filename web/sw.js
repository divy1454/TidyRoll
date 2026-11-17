// Offline support for the website version.
// Pages and code: network first, so updates show up straight away; the cached copy is used offline.
// Models, runtime, map data and fonts: cache first (large and rarely changed).
// When you replace a model, the runtime or the map data, change CACHE below.
const CACHE = 'tidyroll-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/art.js', 'js/sources.js', 'js/output.js',
  'js/engine/analyzer.js', 'js/engine/worker.js', 'js/engine/vision.js', 'js/engine/meta.js', 'js/engine/labels.js',
  'js/engine/geo.js', 'js/engine/organize.js', 'js/engine/planner.js', 'js/engine/search.js',
  'fonts/display-latin.woff2', 'fonts/text-latin.woff2', 'icons/icon.svg', 'manifest.webmanifest'];
const HEAVY = /\.(onnx|wasm|tsv|woff2|png|svg)$|\/data\/|\/vendor\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const store = (req, res) => {
  if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
};

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (HEAVY.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => store(e.request, res))));
  } else {
    e.respondWith(fetch(e.request).then((res) => store(e.request, res)).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
