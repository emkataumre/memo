"use client";

import { useSyncExternalStore } from "react";
import type { Author } from "@/lib/types";

const KEY = "memo_self";
const CHANGE_EVENT = "memo:self-changed";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot(): Author | null {
  const v = localStorage.getItem(KEY);
  return v === "emo" || v === "magi" ? v : null;
}

function getServerSnapshot(): Author | null {
  return null;
}

export function useSelf(): Author | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setSelf(value: Author | null): void {
  if (value === null) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, value);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
