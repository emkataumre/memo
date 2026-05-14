"use client";

interface Props {
  onNewNote: () => void;
  onCamera?: () => void;
  onSong?: () => void;
}

export default function Fabs({ onNewNote, onCamera, onSong }: Props) {
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex flex-row gap-3 items-center">
      <button
        onClick={onCamera}
        aria-label="Napravi snimka"
        disabled={!onCamera}
        className="bg-paper border-2 border-ink shadow-[5px_5px_0_var(--ink)] flex items-center justify-center cursor-pointer active:translate-x-[5px] active:translate-y-[5px] active:shadow-none transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ width: 56, height: 56 }}
      >
        <svg
          viewBox="0 0 28 28"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="w-7 h-7 text-ink"
        >
          <path d="M4 8 L8 8 L10 5 L18 5 L20 8 L24 8 L24 23 L4 23 Z" />
          <circle cx="14" cy="15" r="5" />
        </svg>
      </button>
      <button
        onClick={onNewNote}
        aria-label="Pusni belejka"
        className="bg-coral border-2 border-ink shadow-[6px_6px_0_var(--ink)] flex items-center justify-center cursor-pointer active:translate-x-[6px] active:translate-y-[6px] active:shadow-none transition-transform"
        style={{ width: 68, height: 68 }}
      >
        <svg viewBox="0 0 28 28" fill="none" className="w-8 h-8 text-ink">
          <path
            d="M14 5 L14 23 M5 14 L23 14"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        onClick={onSong}
        aria-label="Pesen na denya"
        disabled={!onSong}
        className="bg-paper border-2 border-ink shadow-[5px_5px_0_var(--ink)] flex items-center justify-center cursor-pointer active:translate-x-[5px] active:translate-y-[5px] active:shadow-none transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ width: 56, height: 56 }}
      >
        <svg
          viewBox="0 0 28 28"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="w-7 h-7 text-ink"
        >
          <ellipse cx="9" cy="21" rx="5" ry="3.5" fill="currentColor" />
          <path d="M14 21 L14 5 L23 4 L23 17" />
          <ellipse cx="19" cy="17" rx="4" ry="3" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
