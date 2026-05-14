"use client";

interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  canFit: boolean;
}

export default function ZenZoomBar({
  onZoomIn,
  onZoomOut,
  onFit,
  canFit,
}: Props) {
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex flex-row gap-2 items-center opacity-40 hover:opacity-80 focus-within:opacity-80 transition-opacity">
      <Btn onClick={onZoomOut} aria-label="Namali">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
          <path
            d="M5 12 L19 12"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </Btn>
      <Btn onClick={onFit} disabled={!canFit} aria-label="Pobiraj vsichko">
        <span className="font-pixel text-[10px] tracking-widest">POBI</span>
      </Btn>
      <Btn onClick={onZoomIn} aria-label="Uvelichi">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
          <path
            d="M12 5 L12 19 M5 12 L19 12"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </Btn>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
} & React.AriaAttributes) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-11 h-11 bg-paper border-2 border-ink shadow-[3px_3px_0_var(--ink)] flex items-center justify-center cursor-pointer active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-transform select-none disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[3px_3px_0_var(--ink)]"
      {...rest}
    >
      {children}
    </button>
  );
}
