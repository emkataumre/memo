/* memo service worker — offline shell.
 *
 * Bump CACHE_VERSION whenever the precache list or fetch routing changes.
 * The activate handler deletes any cache whose name doesn't match.
 */

const CACHE_VERSION = "memo-v3";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const RSC_CACHE = `${CACHE_VERSION}-rsc`;

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
      // install. Skip anything that redirected — caching + serving a
      // redirected response from SW throws "Response has redirections".
      await Promise.all(
        SHELL_URLS.map(async (url) => {
          try {
            const res = await fetch(url, {
              credentials: "same-origin",
              redirect: "follow",
            });
            if (res.ok && !res.redirected) {
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

function isFlightRequest(req) {
  // Next.js App Router fetches an RSC payload on every client-side
  // navigation and prefetch. These do not have request.mode === "navigate"
  // because they're internal fetches, so without this branch the SW
  // never sees them and offline navigation hangs.
  return (
    req.headers.get("RSC") === "1" ||
    req.headers.get("Next-Router-Prefetch") === "1"
  );
}

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

  // RSC payloads (App Router client-side navigation + prefetch).
  // Network-first with a cache fallback so offline navigation between
  // pages we've already visited (or prefetched) keeps working.
  if (sameOrigin && isFlightRequest(req)) {
    event.respondWith(networkFirstRsc(req));
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

// A redirected response cannot be stored in SW caches per spec — the
// browser refuses to serve it back via fetchEvent.respondWith and throws
// "Response served by service worker has redirections". Always gate
// cache.put on this.
function isCacheable(res) {
  return res.ok && !res.redirected;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (isCacheable(res)) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      if (isCacheable(res)) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached ?? networkPromise;
}

async function networkFirstRsc(request) {
  const cache = await caches.open(RSC_CACHE);
  try {
    const res = await fetch(request);
    if (isCacheable(res)) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Fall back to a generic "page not cached yet" so the client at
    // least gets a defined response and can show its own offline state.
    return new Response("", {
      status: 503,
      headers: { "Content-Type": "text/x-component" },
    });
  }
}

async function networkFirstShell(request) {
  try {
    const res = await fetch(request);
    if (isCacheable(res)) {
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
