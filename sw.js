const CACHE = "prayer-app-cache-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./game.js",
  "./manifest.webmanifest",
  "./bg_main.png",
  "./kompas.png",
  "./strelka.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(()=>caches.match("./")))
  );
});

self.addEventListener("message", (e) => {
  const data = e.data || {};
  if (data.type === "notify") {
    self.registration.showNotification(data.title || "Уведомление", {
      body: data.body || "",
      icon: "./kompas.png"
    });
  }
});
