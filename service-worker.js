const CACHE_NAME = "np-track-shell-v15";
const IMAGE_CACHE_NAME = "np-track-images-v1";
const RUNTIME_CACHE_NAME = "np-track-runtime-v1";
const EXTERNAL_RUNTIME_URLS = ["https://cdn.tailwindcss.com/"];
const APP_SHELL = [
  "./",
  "./index.html",
  "./about/",
  "./about/index.html",
  "./compare/",
  "./compare/index.html",
  "./compare.js",
  "./app.js",
  "./about-settings.js",
  "./offline-cache.js",
  "./utils.js",
  "./version.js",
  "./offline.html",
  "./manifest.webmanifest",
  "./assets/playstation-mark.svg",
  "./assets/ps3-mark.svg",
  "./assets/ps4-wordmark.svg",
  "./assets/ps5-wordmark.svg",
  "./assets/psvita-mark.svg",
  "./assets/icons/app-icon-192.png",
  "./assets/icons/app-icon-512.png",
  "./assets/icons/app-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  const freshShellRequests = APP_SHELL.map(
    (url) => new Request(url, { cache: "reload" }),
  );
  event.waitUntil(
    Promise.all([
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.addAll(freshShellRequests)),
      cacheExternalRuntime(),
    ]),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== CACHE_NAME &&
                key !== IMAGE_CACHE_NAME &&
                key !== RUNTIME_CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === "CLEAR_IMAGE_CACHE") {
    event.waitUntil(caches.delete(IMAGE_CACHE_NAME));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (request.destination === "image" && url.protocol === "https:") {
    event.respondWith(staleWhileRevalidateImage(request));
    return;
  }
  if (
    request.destination === "script" &&
    url.hostname === "cdn.tailwindcss.com"
  ) {
    event.respondWith(staleWhileRevalidateRuntime(request));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./offline.html"));
    return;
  }

  if (["script", "style", "manifest"].includes(request.destination)) {
    event.respondWith(networkFirst(request));
    return;
  }

});

async function cacheExternalRuntime() {
  const cache = await caches.open(RUNTIME_CACHE_NAME);
  await Promise.allSettled(
    EXTERNAL_RUNTIME_URLS.map(async (url) => {
      const request = new Request(url, { mode: "no-cors" });
      const response = await fetch(request);
      await cache.put(request, response);
    }),
  );
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(
      new Request(request, { cache: "no-store" }),
    );
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (fallbackUrl && (await cache.match(fallbackUrl))) || Response.error();
  }
}

async function staleWhileRevalidateImage(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then(async (response) => {
      if (response.ok || response.type === "opaque") {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || (await fresh) || Response.error();
}

async function staleWhileRevalidateRuntime(request) {
  const cache = await caches.open(RUNTIME_CACHE_NAME);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then(async (response) => {
      if (response.ok || response.type === "opaque") {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || (await fresh) || Response.error();
}
