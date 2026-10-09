// Crew+ web clock-in: the service worker keeps the page and its two libraries on the phone, so the app opens with no
// signal and a clock in can be saved to the queue. The server is NEVER cached: every API call goes to the network.
//
// 🚨 Our own files are served from the copy and refreshed behind it (stale-while-revalidate), so a fix put on the
// site reaches a phone on its SECOND open after the deploy, with no cache name to bump and nothing to tell staff.
// The two libraries are pinned by version in their URL, so their copy is final (cache-first).
const SHELL = "crew-web-v1";
const FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./rules.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // The server: network only, nothing stored.
  if (url.hostname.endsWith(".supabase.co")) return;
  if (event.request.method !== "GET") return;
  const ours = url.origin === self.location.origin;
  const lib = url.hostname === "cdn.jsdelivr.net";
  if (!ours && !lib) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => {
      const fresh = fetch(event.request).then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(event.request, res.clone()));
        return res;
      });
      if (hit && lib) return hit;
      if (hit) { event.waitUntil(fresh.catch(() => {})); return hit; }
      return fresh;
    }),
  );
});
