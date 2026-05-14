"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser-side Supabase client. One per tab.
//
// Auth: we don't use Supabase Auth — the gate is the memo passphrase.
// `/api/realtime/token` returns a short-lived JWT (1h, role=authenticated,
// memo_role=memo_session) that satisfies RLS read policies + Realtime
// channel auth. We refresh it proactively before expiry and on tab
// resume. REST requests pick up the latest token via a custom fetch
// wrapper that injects the current `Authorization` on every call;
// Realtime gets it via `client.realtime.setAuth(token)`.

interface TokenState {
  token: string | null;
  expiresAt: number;
}

const REFRESH_LEEWAY_MS = 5 * 60 * 1000;
const VISIBILITY_REFRESH_THRESHOLD_MS = 60 * 1000;

let clientPromise: Promise<SupabaseClient> | null = null;
const state: TokenState = { token: null, expiresAt: 0 };
let inflightFetch: Promise<void> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchToken(): Promise<void> {
  if (inflightFetch) return inflightFetch;
  inflightFetch = (async () => {
    try {
      const res = await fetch("/api/realtime/token", { cache: "no-store" });
      if (res.status === 401) {
        if (typeof window !== "undefined") {
          window.location.assign("/passphrase");
        }
        throw new Error("session expired");
      }
      if (!res.ok) {
        throw new Error(`token endpoint returned ${res.status}`);
      }
      const data = (await res.json()) as { token: string; expiresAt: number };
      state.token = data.token;
      state.expiresAt = data.expiresAt;
    } finally {
      inflightFetch = null;
    }
  })();
  return inflightFetch;
}

function scheduleRefresh(client: SupabaseClient): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(
    15_000,
    state.expiresAt - Date.now() - REFRESH_LEEWAY_MS,
  );
  refreshTimer = setTimeout(async () => {
    try {
      await fetchToken();
      if (state.token) client.realtime.setAuth(state.token);
    } catch {
      /* fetchToken handles 401 by redirecting; transient errors retry on next schedule */
    } finally {
      scheduleRefresh(client);
    }
  }, delay);
}

export async function getSupabaseBrowser(): Promise<SupabaseClient> {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required",
      );
    }
    await fetchToken();
    if (!state.token) throw new Error("realtime token unavailable");

    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
      global: {
        fetch: (input, init = {}) => {
          const headers = new Headers(init.headers);
          if (state.token) {
            headers.set("Authorization", `Bearer ${state.token}`);
          }
          return fetch(input, { ...init, headers });
        },
      },
    });
    client.realtime.setAuth(state.token);
    scheduleRefresh(client);

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) return;
        const remaining = state.expiresAt - Date.now();
        if (remaining < VISIBILITY_REFRESH_THRESHOLD_MS) {
          fetchToken().then(() => {
            if (state.token) client.realtime.setAuth(state.token);
          });
        }
      });
    }

    return client;
  })();
  return clientPromise;
}
