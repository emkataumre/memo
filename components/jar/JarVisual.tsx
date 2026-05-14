"use client";

// Mason-jar silhouette with a coral fill that scales with the number
// of ideas currently in rotation. Paper "slips" float in the fill so
// the contents look like folded notes. Fill saturates at MAX_FILL.

const MAX_FILL = 15;
const MIN_VISIBLE_FILL_PX = 14;

// SVG geometry. Body interior spans x∈[50,190], y∈[40,250].
const VIEWBOX = { w: 240, h: 270 };
const BODY_TOP = 40;
const BODY_BOTTOM = 250;
const BODY_PATH =
  "M 60 40 L 50 60 L 50 235 Q 50 250 70 250 L 170 250 Q 190 250 190 235 L 190 60 L 180 40 Z";

interface Props {
  count: number;
}

export default function JarVisual({ count }: Props) {
  const fillRatio = Math.min(1, count / MAX_FILL);
  const rawHeight = (BODY_BOTTOM - BODY_TOP - 6) * fillRatio;
  const fillHeight =
    count === 0 ? 0 : Math.max(MIN_VISIBLE_FILL_PX, rawHeight);
  const fillTop = BODY_BOTTOM - fillHeight;

  const slips = Array.from({ length: Math.min(count, MAX_FILL) }, (_, i) => {
    // Deterministic pseudo-random placement so the layout doesn't
    // re-shuffle on every render — slips stack from the bottom up.
    const seed = i * 167 + 13;
    const row = Math.floor(i / 3);
    const col = i % 3;
    const xJitter = ((seed % 23) - 11) * 0.7;
    const yJitter = ((seed % 7) - 3) * 0.6;
    const w = 24 + ((seed % 9) - 4);
    const tilt = ((seed % 17) - 8) * 0.9;
    const cx = 78 + col * 32 + xJitter;
    const cy = BODY_BOTTOM - 14 - row * 10 + yJitter;
    return { cx, cy, w, tilt, key: i };
  });

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
      className="w-full h-auto max-w-[220px]"
      aria-label={`Date jar containing ${count} ${count === 1 ? "idea" : "ideas"}`}
    >
      <defs>
        <clipPath id="jar-body-clip">
          <path d={BODY_PATH} />
        </clipPath>
      </defs>

      {/* Lid top (narrower) */}
      <rect
        x="58"
        y="8"
        width="124"
        height="14"
        fill="var(--ink-deep)"
        stroke="var(--ink)"
        strokeWidth="2.5"
      />
      {/* Cap rim (widest) */}
      <rect
        x="38"
        y="20"
        width="164"
        height="20"
        fill="var(--ink)"
        stroke="var(--ink)"
        strokeWidth="2.5"
      />
      {/* Lid highlight + ridge */}
      <rect x="66" y="12" width="22" height="2.5" fill="var(--paper)" opacity="0.45" />
      <line
        x1="46"
        y1="30"
        x2="194"
        y2="30"
        stroke="var(--paper)"
        strokeWidth="0.8"
        opacity="0.18"
      />

      {/* Body outline */}
      <path
        d={BODY_PATH}
        fill="var(--paper)"
        stroke="var(--ink)"
        strokeWidth="4"
      />

      {/* Glass highlight stripe (left side) */}
      <rect
        x="58"
        y="70"
        width="3"
        height="160"
        fill="var(--paper)"
        opacity="0.55"
      />
      <rect
        x="65"
        y="78"
        width="2"
        height="40"
        fill="var(--paper)"
        opacity="0.35"
      />

      {/* Fill, clipped to body */}
      {count > 0 && (
        <g clipPath="url(#jar-body-clip)">
          <rect
            x="0"
            y={fillTop}
            width={VIEWBOX.w}
            height={fillHeight + 4}
            fill="var(--coral)"
          />
          {/* Wobbly liquid surface */}
          <path
            d={`M 40 ${fillTop}
                Q 65 ${fillTop - 4} 90 ${fillTop}
                T 140 ${fillTop}
                T 200 ${fillTop}
                L 200 ${fillTop + 6}
                L 40 ${fillTop + 6} Z`}
            fill="var(--coral)"
          />
          {/* Soft inner shadow at the bottom */}
          <rect
            x="40"
            y={BODY_BOTTOM - 8}
            width="160"
            height="8"
            fill="var(--ink)"
            opacity="0.18"
          />
          {/* Slips */}
          {slips.map((s) => (
            <g key={s.key} transform={`rotate(${s.tilt} ${s.cx} ${s.cy})`}>
              <rect
                x={s.cx - s.w / 2}
                y={s.cy - 3}
                width={s.w}
                height={6}
                fill="var(--paper)"
                stroke="var(--ink)"
                strokeWidth="1"
              />
              <line
                x1={s.cx - s.w / 2 + 2}
                y1={s.cy}
                x2={s.cx + s.w / 2 - 2}
                y2={s.cy}
                stroke="var(--ink-soft)"
                strokeWidth="0.6"
                opacity="0.5"
              />
            </g>
          ))}
        </g>
      )}

      {/* Cap shadow under rim — adds depth */}
      <rect
        x="50"
        y="40"
        width="140"
        height="2"
        fill="var(--ink)"
        opacity="0.35"
      />
    </svg>
  );
}
