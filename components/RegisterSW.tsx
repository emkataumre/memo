"use client";

import { useEffect } from "react";

// Registers the service worker on first paint. Production-only — in dev
// mode Next.js HMR conflicts with SW caching and produces stale chunks
// that look like bugs. Users get the SW on the Vercel/Netlify build.

export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        // Non-fatal — the app works without the SW, just no offline shell.
        console.error("[memo] sw register failed", err);
      });
  }, []);

  return null;
}
