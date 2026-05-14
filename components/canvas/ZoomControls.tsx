"use client";

interface Props {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  canFit: boolean;
}

export default function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  canFit,
}: Props) {
  const pct = Math.round(zoom * 100);
  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-2.5 items-stretch">
      <Btn onClick={onZoomIn} aria-label="Zoom in" primary>
        <PlusIcon />
      </Btn>
      <Btn onClick={onZoomOut} aria-label="Zoom out">
        <MinusIcon />
      </Btn>
      <Btn onClick={onFit} aria-label="Fit all content" disabled={!canFit}>
        <span className="font-pixel text-[10px] tracking-widest">FIT</span>
      </Btn>
      <div className="text-center font-pixel text-[10px] tracking-widest uppercase text-ink-soft bg-paper border-2 border-ink px-2 py-1 select-none">
        {pct}%
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  primary,
  disabled,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
} & React.AriaAttributes) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-11 h-11 border-2 border-ink shadow-[4px_4px_0_var(--ink)] flex items-center justify-center cursor-pointer active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-transform select-none ${
        primary ? "bg-coral" : "bg-paper"
      } disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[4px_4px_0_var(--ink)]`}
      {...rest}
    >
      {children}
    </button>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <path
        d="M12 5 L12 19 M5 12 L19 12"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
      <path
        d="M5 12 L19 12"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
