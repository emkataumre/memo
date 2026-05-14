"use client";

import { useEffect, useMemo, useState } from "react";
import { useSelf } from "@/lib/self/useSelf";
import { enablePush, isPushEnabled, pushSupport } from "@/lib/push/client";

// Small bell pill that appears in the TopBar slot when:
//   - the browser supports push,
//   - the user hasn't already enabled it on this device.
// Tapping triggers the permission prompt + subscription POST. On
// success, the button hides itself for this session.
//
// iOS Safari: push only works for PWAs installed to the home screen,
// so the support check would still pass — the subscribe call is the
// thing that actually errors. We show the result inline either way.

type UiState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "enabled" }
  | { kind: "denied" }
  | { kind: "error"; message: string };

export default function PushButton() {
  const self = useSelf();
  const support = useMemo(() => pushSupport(), []);
  const [state, setState] = useState<UiState>({ kind: "idle" });

  useEffect(() => {
    if (!support.ok) return;
    let cancelled = false;
    isPushEnabled().then((enabled) => {
      if (cancelled) return;
      if (enabled) setState({ kind: "enabled" });
    });
    return () => {
      cancelled = true;
    };
  }, [support.ok]);

  if (!support.ok) return null;
  if (state.kind === "enabled") return null;
  if (!self) return null;

  async function onClick() {
    if (!self) return;
    if (state.kind === "working") return;
    setState({ kind: "working" });
    const result = await enablePush(self);
    switch (result.status) {
      case "enabled":
        setState({ kind: "enabled" });
        break;
      case "denied":
        setState({ kind: "denied" });
        break;
      case "unsupported":
        // Should be unreachable — caught by the support memo above.
        setState({ kind: "error", message: result.reason });
        break;
      case "error":
        setState({ kind: "error", message: result.error });
        break;
    }
  }

  const label =
    state.kind === "denied"
      ? "blocked"
      : state.kind === "error"
        ? "retry"
        : state.kind === "working"
          ? "…"
          : "notify";

  return (
    <button
      onClick={onClick}
      aria-label="Enable reveal notifications"
      title={
        state.kind === "denied"
          ? "Notifications blocked in browser settings"
          : state.kind === "error"
            ? state.message
            : "Get a notification when tonight unlocks"
      }
      className="w-8 h-8 border-2 border-paper flex items-center justify-center cursor-pointer active:bg-paper active:text-ink flex-shrink-0 relative"
    >
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none">
        {/* Bell body */}
        <path
          d="M 4 11 V 7 a 4 4 0 0 1 8 0 V 11 L 13 12 L 3 12 Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        {/* Clapper */}
        <path
          d="M 7 13 a 1 1 0 0 0 2 0"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </button>
  );
}
