"use client";

interface Props {
  onExit: () => void;
}

export default function ZenExit({ onExit }: Props) {
  return (
    <button
      onClick={onExit}
      aria-label="Exit zen mode"
      className="fixed top-4 right-4 z-[60] bg-ink/85 text-paper border-2 border-ink shadow-[3px_3px_0_var(--coral)] w-11 h-11 flex items-center justify-center cursor-pointer active:translate-x-[3px] active:translate-y-[3px] active:shadow-none select-none backdrop-blur-sm"
    >
      <svg viewBox="0 0 14 14" className="w-5 h-5" fill="none">
        <path
          d="M3 3 L11 11 M11 3 L3 11"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
