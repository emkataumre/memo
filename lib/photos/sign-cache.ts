"use client";

import {
  cacheLoadSignedUrls,
  cacheUpsertSignedUrl,
  cacheDeleteSignedUrl,
} from "@/lib/cache/indexeddb";

// Browser-side cache of signed URLs for revealed photos. The server
// (/api/photos/sign) is the only path that can mint URLs because the
// bucket is private; this cache batches client requests (16ms debounce)
// so a freshly-loaded canvas with N revealed photos costs one HTTP call
// instead of N. URLs are invalidated five minutes before their server
// TTL so a render never holds an expired link.
//
// Entries are mirrored to IndexedDB so a cold reload within the URL's
// 1h TTL skips the re-sign roundtrip entirely (hydrate() seeds `map`
// before the first render reaches photo components).

export interface CachedUrl {
  thumb_url: string;
  full_url: string;
  expires_at: number; // ms since epoch
}

interface SignResponse {
  urls: Record<
    string,
    | { thumb_url: string; full_url: string; expires_at: number }
    | { error: string }
  >;
}

type Listener = () => void;

const BATCH_DEBOUNCE_MS = 16;
const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

class SignCache {
  private map = new Map<string, CachedUrl>();
  private listeners = new Set<Listener>();
  private pending = new Set<string>();
  private inflight = new Set<string>();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private version = 0;
  private hydratePromise: Promise<void> | null = null;

  get(id: string): CachedUrl | null {
    const cached = this.map.get(id);
    if (!cached) return null;
    if (cached.expires_at - Date.now() < REFRESH_LEEWAY_MS) return null;
    return cached;
  }

  // Seed in-memory map from IndexedDB. Filters out entries that fall
  // inside the refresh-leeway window (those would be returned as null
  // by get() anyway, and keeping them just delays the inevitable
  // re-sign). Idempotent: repeated calls share one promise.
  hydrate(): Promise<void> {
    if (this.hydratePromise) return this.hydratePromise;
    this.hydratePromise = (async () => {
      const rows = await cacheLoadSignedUrls();
      const cutoff = Date.now() + REFRESH_LEEWAY_MS;
      let added = false;
      const stale: string[] = [];
      for (const row of rows) {
        if (row.expires_at > cutoff) {
          this.map.set(row.id, {
            thumb_url: row.thumb_url,
            full_url: row.full_url,
            expires_at: row.expires_at,
          });
          added = true;
        } else {
          stale.push(row.id);
        }
      }
      if (stale.length) {
        for (const id of stale) void cacheDeleteSignedUrl(id);
      }
      if (added) this.emit();
    })();
    return this.hydratePromise;
  }

  // Snapshot for useSyncExternalStore-style consumers. Changes whenever
  // the cache mutates in a way subscribers care about.
  getVersion(): number {
    return this.version;
  }

  ensureMany(ids: Iterable<string>): void {
    let added = false;
    for (const id of ids) {
      if (this.inflight.has(id)) continue;
      if (this.map.get(id) && this.get(id)) continue;
      if (!this.pending.has(id)) {
        this.pending.add(id);
        added = true;
      }
    }
    if (!added) return;
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => this.flush(), BATCH_DEBOUNCE_MS);
  }

  evict(id: string): void {
    if (this.map.delete(id)) {
      void cacheDeleteSignedUrl(id);
      this.emit();
    }
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  private async flush(): Promise<void> {
    this.batchTimer = null;
    if (this.pending.size === 0) return;
    const ids = Array.from(this.pending);
    this.pending.clear();
    for (const id of ids) this.inflight.add(id);
    try {
      const res = await fetch("/api/photos/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as SignResponse;
      let changed = false;
      for (const [id, val] of Object.entries(data.urls ?? {})) {
        if ("thumb_url" in val && "full_url" in val && "expires_at" in val) {
          const entry: CachedUrl = {
            thumb_url: val.thumb_url,
            full_url: val.full_url,
            expires_at: val.expires_at,
          };
          this.map.set(id, entry);
          void cacheUpsertSignedUrl({ id, ...entry });
          changed = true;
        }
      }
      if (changed) this.emit();
    } catch {
      /* network blip — caller will ensure() again on next render */
    } finally {
      for (const id of ids) this.inflight.delete(id);
    }
  }
}

export const signCache = new SignCache();
