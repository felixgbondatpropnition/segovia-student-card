// Network first, cache as the fallback. A student's card has to open in a bar with no
// signal, but nobody should ever be stuck on an old copy of the site while online.
var PREFIX = 'ssc-';
var V = '4'; // the same number as the ?v= on the asset links in every page. Bump both together.
var CACHE = PREFIX + 'v' + V;
var SHELL = [
  './', 'venues/', 'join/', 'card/', 'verify/', 'for-venues/',
  'assets/style.css?v=' + V, 'assets/config.js?v=' + V, 'assets/core.js?v=' + V, 'assets/app.js?v=' + V,
  'vendor/qrcode.js?v=' + V, 'assets/icon.svg', 'manifest.webmanifest'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      // Only this site's old caches. GitHub Pages puts every project of one account on the same
      // origin, so a wider filter would wipe the caches of the other sites too.
      return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// A page is stored without its query string, so card/?new=1 and card/ are one entry. Assets keep
// theirs: the ?v= is what stops a new page from ever being paired with an old script.
function cacheKey(req) {
  var url = new URL(req.url);
  if (req.mode === 'navigate') url.search = '';
  return url.href;
}

// One bar of signal is worse than none: the request neither fails nor finishes. After this long
// the saved copy is shown instead, and the network answer still refreshes the cache when it lands.
var PATIENCE_MS = 2500;
// Once one request has had to give up waiting, the network is known to be bad, so for a short
// while the rest of the page comes straight from the saved copy instead of each file waiting its
// own 2.5 seconds in turn. The window is not extended by its own cache hits, so it always ends.
var SLOW_FOR_MS = 15000;
var slowUntil = 0;

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonts) return;

  var key = cacheKey(req);
  var started = Date.now();

  var network = fetch(req).then(function (res) {
    // An answer that came back quickly is proof the network is healthy again.
    if (Date.now() - started < PATIENCE_MS) slowUntil = 0;
    if (!res || !res.ok) return res;
    var copy = res.clone();
    return caches.open(CACHE)
      .then(function (cache) { return cache.put(key, copy); })
      .catch(function () { /* a full disk must not break the page */ })
      .then(function () { return res; });
  });
  event.waitUntil(network.catch(function () { /* offline: nothing to store */ }));

  event.respondWith(new Promise(function (resolve) {
    var settled = false;
    function settle(res) { if (!settled) { settled = true; resolve(res); } }

    var inSlowMode = Date.now() < slowUntil;
    var timer = setTimeout(function () {
      caches.match(key).then(function (hit) {
        if (!hit) return; // nothing saved: keep waiting for the network
        if (!inSlowMode) slowUntil = Date.now() + SLOW_FOR_MS;
        settle(hit);
      });
    }, inSlowMode ? 0 : PATIENCE_MS);

    network.then(function (res) { clearTimeout(timer); settle(res); })
      .catch(function () {
        clearTimeout(timer);
        caches.match(key).then(function (hit) { settle(hit || Response.error()); });
      });
  }));
});
