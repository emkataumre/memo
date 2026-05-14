"use client";

import { useEffect, useState } from "react";
import type { Photo } from "@/lib/types";
import { minutesUntilNextReveal } from "@/lib/memo-day";

interface Props {
  photos: Photo[];
  onClose: () => void;
}

const TILTS = [-3, 4, -2, 5, -5, 3, -4];

export default function LockedRoll({ photos, onClose }: Props) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const locked = photos.filter((p) => p.locked);
  const lockedEmo = locked.filter((p) => p.author === "emo").length;
  const lockedMagi = locked.filter((p) => p.author === "magi").length;

  const minutes = minutesUntilNextReveal();
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const countdown =
    hh > 0
      ? `${hh}H ${String(mm).padStart(2, "0")}M`
      : `${String(mm).padStart(2, "0")}M`;

  return (
    <div className="fixed inset-0 z-[160] bg-paper overflow-auto">
      <header className="sticky top-0 h-11 bg-ink text-paper flex items-center justify-between px-4 z-10 border-b-2 border-ink font-pixel text-xs tracking-widest uppercase">
        <span className="font-display text-2xl text-coral leading-none normal-case tracking-normal">
          memo
        </span>
        <span className="opacity-65 hidden sm:inline">today&apos;s roll</span>
        <button
          onClick={onClose}
          className="border-2 border-paper px-2.5 py-1 active:bg-paper active:text-ink cursor-pointer"
        >
          back
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-6 pt-10 pb-6">
        <h1 className="font-display text-6xl sm:text-7xl leading-none">
          today&apos;s <span className="text-coral">roll.</span>
        </h1>
        <div className="mt-6 flex items-center gap-3 flex-wrap">
          <span className="border-2 border-coral text-coral px-2.5 py-1 font-pixel text-[11px] tracking-widest uppercase flex items-center gap-2 shadow-[2px_2px_0_var(--coral)]">
            <svg viewBox="0 0 14 14" className="w-2.5 h-2.5" fill="none">
              <rect
                x="3"
                y="6"
                width="8"
                height="6"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M5 6 V 4 a 2 2 0 0 1 4 0 V 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            {countdown} left
          </span>
          <span className="font-pixel text-[10px] tracking-widest uppercase text-ink-soft">
            until reveal at 21:00
          </span>
        </div>
        {lockedEmo + lockedMagi > 0 && (
          <div className="mt-4 flex gap-2">
            {lockedEmo > 0 && <Tally name="EMO" count={lockedEmo} />}
            {lockedMagi > 0 && <Tally name="MAGI" count={lockedMagi} />}
          </div>
        )}
      </div>

      {locked.length > 0 ? (
        <div className="max-w-3xl mx-auto px-6 pb-32 grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-10">
          {locked.map((p, i) => (
            <LockedTile
              key={p.id}
              photo={p}
              tilt={TILTS[i % TILTS.length]}
            />
          ))}
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-6 py-12 text-center font-pixel text-xs tracking-widest uppercase text-ink-soft">
          nothing pending — go take a picture.
        </div>
      )}
    </div>
  );
}

function Tally({ name, count }: { name: string; count: number }) {
  return (
    <span className="font-pixel text-[11px] tracking-widest uppercase border-2 border-ink px-2 py-1 bg-paper-deep flex items-center gap-2">
      {name}
      <span className="bg-ink text-paper px-1.5 py-0.5 text-[10px]">
        {count}
      </span>
    </span>
  );
}

function LockedTile({ photo, tilt }: { photo: Photo; tilt: number }) {
  const d = new Date(photo.taken_at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;

  return (
    <div
      className="relative bg-white border-2 border-ink shadow-[8px_8px_0_var(--ink)] p-3.5 pb-11"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <div
        className="w-full aspect-square bg-ink-deep relative overflow-hidden flex items-center justify-center"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 40%, rgba(255,92,57,0.10), transparent 60%), radial-gradient(circle, rgba(242,232,213,0.06) 1px, transparent 1.5px), repeating-linear-gradient(45deg, transparent 0 8px, rgba(255,92,57,0.05) 8px 9px)`,
          backgroundSize: "auto, 7px 7px, auto",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="w-10 h-10 text-coral z-10"
        >
          <rect
            x="5"
            y="11"
            width="14"
            height="10"
            rx="1"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M8 11 V 7 a 4 4 0 0 1 8 0 V 11"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="absolute bottom-2 right-2 font-pixel text-[10px] tracking-widest text-coral bg-ink-deep px-1.5 py-0.5 border border-coral z-10">
          {time}
        </div>
      </div>
      <div className="absolute bottom-2.5 left-3.5 right-3.5 flex justify-between font-pixel text-[10px] uppercase tracking-widest">
        <span className="text-ink">{photo.author}</span>
        <span className="text-coral flex items-center gap-1.5">
          <span className="w-1 h-1 bg-coral inline-block" />
          locked
        </span>
      </div>
    </div>
  );
}
