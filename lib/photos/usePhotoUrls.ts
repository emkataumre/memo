"use client";

import { useEffect, useSyncExternalStore } from "react";
import { signCache, type CachedUrl } from "./sign-cache";

// Subscribe to a single photo's URLs. Triggers the sign-cache to fetch
// if the id isn't yet cached; returns null until the URL arrives.
// Multiple concurrent consumers coalesce into a single batched request.
export function usePhotoUrl(id: string | null | undefined): CachedUrl | null {
  useSyncExternalStore(
    (cb) => signCache.subscribe(cb),
    () => signCache.getVersion(),
    () => 0,
  );
  useEffect(() => {
    if (id) signCache.ensureMany([id]);
  }, [id]);
  return id ? signCache.get(id) : null;
}

// Bulk warm-up. Pass the ids that the screen is about to render so
// the batch fetch fires once on mount instead of N times as children
// hydrate.
export function usePhotoUrlPrefetch(ids: string[]): void {
  const key = ids.join(",");
  useEffect(() => {
    if (ids.length > 0) signCache.ensureMany(ids);
    // The id list is fingerprinted via `key` to avoid re-firing for new
    // array identity when contents are unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
