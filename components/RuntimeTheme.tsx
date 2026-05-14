"use client";

import { useEffect } from "react";

// Two runtime palette modifiers, applied as CSS variable overrides on
// :root:
//   1. Time-of-day dim — paper warms toward evening and dims through
//      the night. Subtle.
//   2. First-meet palette — on the 22nd of any month (our anniversary
//      day), coral shifts to a softer wine-rose and paper picks up a
//      faint pink tint regardless of the hour.
//
// The two compose: first-meet wins on the 22nd; the time-of-day shift
// applies on all other days.

interface Palette {
  paper: string;
  paperDeep: string;
  coral?: string;
}

const DEFAULTS = {
  paper: "#f2e8d5",
  paperDeep: "#eadcbf",
  coral: "#ff5c39",
};

const TIME_BANDS: { name: string; from: number; to: number; palette: Palette }[] = [
  // 23:00 – 05:00 — late night, slightly dim + desaturated
  { name: "night", from: 23, to: 24, palette: { paper: "#dfd4be", paperDeep: "#cbc0a8" } },
  { name: "night", from: 0, to: 5, palette: { paper: "#dfd4be", paperDeep: "#cbc0a8" } },
  // 05:00 – 09:00 — cool dawn
  { name: "dawn", from: 5, to: 9, palette: { paper: "#eae3d1", paperDeep: "#d8cfba" } },
  // 09:00 – 16:00 — neutral midday (default)
  { name: "day", from: 9, to: 16, palette: { paper: DEFAULTS.paper, paperDeep: DEFAULTS.paperDeep } },
  // 16:00 – 20:00 — golden afternoon
  { name: "golden", from: 16, to: 20, palette: { paper: "#f4e2c4", paperDeep: "#e6d2aa" } },
  // 20:00 – 23:00 — warm evening
  { name: "evening", from: 20, to: 23, palette: { paper: "#efd6a8", paperDeep: "#dec38f" } },
];

const FIRST_MEET_PALETTE: Palette = {
  paper: "#f3dfd6",
  paperDeep: "#e6c8bd",
  coral: "#a83a5e",
};

function paletteForNow(now: Date): Palette {
  if (now.getDate() === 22) {
    return FIRST_MEET_PALETTE;
  }
  const hour = now.getHours();
  const band = TIME_BANDS.find((b) => hour >= b.from && hour < b.to);
  return band?.palette ?? { paper: DEFAULTS.paper, paperDeep: DEFAULTS.paperDeep };
}

function applyPalette(palette: Palette): void {
  const root = document.documentElement;
  root.style.setProperty("--paper", palette.paper);
  root.style.setProperty("--paper-deep", palette.paperDeep);
  root.style.setProperty("--coral", palette.coral ?? DEFAULTS.coral);
}

export default function RuntimeTheme() {
  useEffect(() => {
    function tick() {
      applyPalette(paletteForNow(new Date()));
    }
    tick();
    // Re-evaluate every 5 minutes so band transitions actually happen
    // for long-open sessions.
    const interval = setInterval(tick, 5 * 60 * 1000);
    // Also re-evaluate when the tab regains focus — covers cases where
    // the OS throttled the interval while backgrounded.
    function onVisible() {
      if (!document.hidden) tick();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
