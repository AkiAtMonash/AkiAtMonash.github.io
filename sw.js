var CACHE = 'buddyfight-v3';
var CORE = ['/', '/self.html', '/index.html', '/game.js', '/styles.css', '/coach.css', '/coach.js', '/loader.js', '/image-list.js', '/engine.js', '/host.js', '/socket-shim.js', '/manifest.json'];
// 新しい版を入れたらすぐ切り替える
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// 画像はキャッシュ優先（変わらないので速さ優先）。それ以外（HTML/JS/CSS）はネットワーク優先にして、
// 直した内容が次の読み込みでそのまま反映されるようにする。オフラインのときだけキャッシュを使う。
self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  if (url.indexOf('/cardImages/') !== -1) {
    e.respondWith(caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      });
    }));
    return;
  }
  e.respondWith(fetch(e.request).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    return res;
  }).catch(function () { return caches.match(e.request); }));
});
