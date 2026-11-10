var CACHE = 'buddyfight-v2';
var CORE = ['/', '/self.html', '/index.html', '/game.js', '/styles.css', '/coach.css', '/coach.js', '/loader.js', '/image-list.js', '/engine.js', '/host.js', '/socket-shim.js', '/manifest.json'];
// 新しい版を入れたらすぐ切り替える（古いキャッシュを抱えたままだと、直した CSS が反映されない）
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// 先に cache を見て、無ければネットワーク。画像は取れたら貯める
self.addEventListener('fetch', function (e) {
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (res) {
      if (e.request.url.indexOf('/cardImages/') !== -1) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    });
  }));
});
