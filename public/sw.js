/* memo service worker — offline shell.
 *
 * Bump CACHE_VERSION whenever the precache list or fetch routing changes.
 * The activate handler deletes any cache whose name doesn't match.
 */

const CACHE_VERSION = "memo-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// HTML routes that should boot offline. The proxy still gates them on
// the passphrase cookie when online; the cached shell only renders the
// empty UI frame so the user isn't staring at a network error.
const SHELL_URLS = [
  "/",
  "/canvas",
  "/passphrase",
  "/jar",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Each URL added individually so one failure doesn't abort the
      // install (some routes 401 without a cookie — still valid as a
      // shell response).
      await Promise.all(
        SHELL_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { credentials: "same-origin" });
            if (res.ok || res.type === "opaqueredirect") {
              await cache.put(url, res.clone());
            }
          } catch {
            /* offline at install? skip; install proceeds */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => !n.startsWith(CACHE_VERSION))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Never intercept Supabase (REST, Realtime, signed photo URLs) or any
  // /api call — those must always go live.
  if (url.hostname.endsWith(".supabase.co")) return;
  if (sameOrigin && url.pathname.startsWith("/api/")) return;

  // Hashed Next.js chunks: immutable, cache-first forever.
  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Google Fonts CSS + woff2 files: SWR.
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  // Spotify album art: SWR. (Embeds themselves are iframes — out of SW
  // scope, browser handles them.)
  if (url.hostname === "i.scdn.co") {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }

  // Navigation requests (HTML): network-first, fall back to cached shell.
  if (req.mode === "navigate") {
    event.respondWith(networkFirstShell(req));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached ?? networkPromise;
}

async function networkFirstShell(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last resort: the canvas shell. Better than nothing.
    const fallback = await cache.match("/canvas");
    if (fallback) return fallback;
    return new Response("offline", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
