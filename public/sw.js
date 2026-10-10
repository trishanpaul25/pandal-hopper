// Minimal offline support: cache the app shell and visited tiles, network-first for pages.
const CACHE = "pandal-hopper-v2";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/icon.svg"]))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  // Never cache sign-in or Firebase traffic.
  if (u.hostname.endsWith("openstreetmap.de") || u.pathname.startsWith("/__/") || /(googleapis|firebase|gstatic|google|firebaseapp)\.com$/.test(u.hostname) && !u.hostname.startsWith("fonts.")) return;
  e.respondWith(
    fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});
