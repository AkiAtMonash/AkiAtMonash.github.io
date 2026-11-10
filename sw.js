var CACHE = 'buddyfight-v1';
var CORE = ['/', '/self.html', '/index.html', '/game.js', '/styles.css', '/coach.css', '/coach.js', '/loader.js', '/image-list.js', '/engine.js', '/host.js', '/socket-shim.js', '/manifest.json'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); })); });
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
