"use client";

import { memoDay } from "@/lib/memo-day";

const MONTHS = [
  "YAN",
  "FEV",
  "MAR",
  "APR",
  "MAY",
  "YUN",
  "YUL",
  "AVG",
  "SEP",
  "OKT",
  "NOE",
  "DEK",
];

function formatMemoDay(d: string): string {
  const parts = d.split("-").map(Number);
  return `${MONTHS[parts[1] - 1]} ${parts[2]}`;
}

interface Props {
  count: number;
  onJump: () => void;
}

export default function TodayAnchor({ count, onJump }: Props) {
  const today = memoDay();

  return (
    <button
      onClick={() => onJump()}
      aria-label="vij dnes"
      className="fixed top-[60px] left-4 z-40 font-pixel text-xs tracking-widest uppercase bg-paper border-2 border-coral px-3 py-1.5 flex items-center gap-2.5 shadow-[3px_3px_0_var(--coral)] cursor-pointer active:translate-x-[2px] active:translate-y-[2px] active:shadow-none select-none"
    >
      <svg viewBox="0 0 12 12" className="w-3 h-3 text-coral">
        <path
          d="M6 1 L7 5 L11 5.5 L8 8 L9 11.5 L6 9.5 L3 11.5 L4 8 L1 5.5 L5 5 Z"
          fill="currentColor"
        />
      </svg>
      <span className="text-ink">{formatMemoDay(today)}</span>
      <span className="bg-coral text-ink px-1.5 py-0 leading-tight border border-ink">
        {count}
      </span>
    </button>
  );
}
