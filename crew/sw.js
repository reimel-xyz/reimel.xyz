// Crew+ web clock-in: the service worker keeps the page and its two libraries on the phone, so the app opens with no
// signal and a clock in can be saved to the queue. The server is NEVER cached: every API call goes to the network.
//
// 🚨 Our own files are served from the copy and refreshed behind it (stale-while-revalidate), so a fix put on the
// site reaches a phone on its SECOND open after the deploy, with no cache name to bump and nothing to tell staff.
// 🚨 EXCEPT when files depend on each other's NEW code (app.js calling a function rules.js only now exports): the
// refresh fetches each file on its own, so a phone that loses signal between two of them keeps a mix that breaks
// offline. Then bump the name: the new worker's install copies the whole list in one go (addAll is all or nothing)
// and throws the old copy away. v2 (15-10-26): the jsDelivr copies dropped. v3 (15-10-26): the per-person queue,
// app.js and rules.js together. v4 (27-10-26): Delete my account, app.js with index.html's new red button style. The
// queue and the card live elsewhere and are never touched by a bump.
const SHELL = "crew-web-v4";
const FILES = [
  "./",
  "./index.html",
  "./app.js",
  "./rules.js",
  "./config.js",
  "./supabase-js-2.49.4.js",
  "./jsQR-1.4.0.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
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
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => {
      const fresh = fetch(event.request).then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(event.request, res.clone()));
        return res;
      });
      if (hit) { event.waitUntil(fresh.catch(() => {})); return hit; }
      return fresh;
    }),
  );
});
