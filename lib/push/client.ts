"use client";

// Browser-side Web Push subscription helper. Flow:
//   1. Wait for the SW registration to be ready.
//   2. Ask the user for Notification permission (browser prompt).
//   3. Subscribe via PushManager with the VAPID public key.
//   4. POST the subscription to /api/push/subscribe so the server can
//      deliver to it.
// Subsequent calls are idempotent — the browser returns the existing
// subscription, the server upsert dedupes on endpoint.

import type { Author } from "@/lib/types";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushEnableResult =
  | { status: "enabled" }
  | { status: "denied" }
  | { status: "unsupported"; reason: string }
  | { status: "error"; error: string };

function isPushSupported(): { ok: true } | { ok: false; reason: string } {
  if (typeof window === "undefined") {
    return { ok: false, reason: "not in browser" };
  }
  if (!("serviceWorker" in navigator)) {
    return { ok: false, reason: "service workers unavailable" };
  }
  if (!("PushManager" in window)) {
    return { ok: false, reason: "push not supported by this browser" };
  }
  if (!("Notification" in window)) {
    return { ok: false, reason: "notifications not supported" };
  }
  return { ok: true };
}

export function pushSupport(): { ok: true } | { ok: false; reason: string } {
  return isPushSupported();
}

export async function enablePush(author: Author): Promise<PushEnableResult> {
  const support = isPushSupported();
  if (!support.ok) return { status: "unsupported", reason: support.reason };

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublic) {
    return {
      status: "unsupported",
      reason: "NEXT_PUBLIC_VAPID_PUBLIC_KEY not configured",
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { status: "denied" };
    }

    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      // BufferSource cast: the PushSubscriptionOptionsInit type expects
      // ArrayBuffer-backed views, and TS's stricter Uint8Array typing
      // refuses Uint8Array<ArrayBufferLike> at the call site even though
      // it works at runtime.
      const key = urlBase64ToUint8Array(vapidPublic);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key as unknown as BufferSource,
      });
    }

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author, subscription: subscription.toJSON() }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { status: "error", error: `subscribe failed (${res.status}): ${text}` };
    }
    return { status: "enabled" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { status: "error", error: message };
  }
}

// Best-effort check: does the browser already hold a push subscription?
// Used by the UI to decide whether to show the "enable" CTA.
export async function isPushEnabled(): Promise<boolean> {
  const support = isPushSupported();
  if (!support.ok) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}
