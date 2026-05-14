"use client";

import type { Photo } from "@/lib/types";
import { usePhotoUrl, usePhotoUrlPrefetch } from "@/lib/photos/usePhotoUrls";

interface Props {
  photos: Photo[];
  onPin: (photo: Photo) => void;
  onUnpin: (photo: Photo) => void;
  onView: (photo: Photo) => void;
  onClose: () => void;
}

const TILTS = [-3, 4, -2, 5, -5, 3, -4];

export default function RevealSheet({
  photos,
  onPin,
  onUnpin,
  onView,
  onClose,
}: Props) {
  usePhotoUrlPrefetch(photos.map((p) => p.id));
  const emoCount = photos.filter((p) => p.author === "emo").length;
  const magiCount = photos.filter((p) => p.author === "magi").length;

  return (
    <div className="fixed inset-0 z-[160] bg-paper overflow-auto">
      <header className="sticky top-0 h-11 bg-ink text-paper flex items-center justify-between px-4 z-10 border-b-2 border-ink font-pixel text-xs tracking-widest uppercase">
        <span className="font-display text-2xl text-coral leading-none normal-case tracking-normal">
          memo
        </span>
        <span className="opacity-65 hidden sm:inline">pokaji</span>
        <button
          onClick={onClose}
          className="border-2 border-paper px-2.5 py-1 active:bg-paper active:text-ink cursor-pointer"
        >
          nazad
        </button>
      </header>

      <div className="relative max-w-3xl mx-auto px-6 pt-14 pb-8 text-center overflow-hidden">
        <Spark
          className="absolute top-3 left-[5%] w-10 text-coral"
          rotation={-10}
          filled
        />
        <Spark
          className="absolute top-24 left-[8%] w-7 text-pink"
          rotation={8}
        />
        <Spark
          className="absolute top-4 right-[12%] w-9 text-ink"
          rotation={20}
          filled
        />
        <Spark
          className="absolute -bottom-2 left-[28%] w-8 text-coral"
          rotation={-15}
          filled
        />
        <Spark
          className="absolute bottom-4 right-[8%] w-9 text-pink"
          rotation={12}
        />

        <h1 className="font-display text-7xl sm:text-8xl leading-none">
          dnes<span className="text-coral">.</span>
        </h1>
        <div className="mt-12 font-display text-xl">
          {photos.length} {photos.length === 1 ? "snimka" : "snimki"}
          {emoCount + magiCount > 0 && (
            <span className="text-coral mx-2">·</span>
          )}
          {emoCount > 0 && (
            <span className="font-mono text-base">{emoCount} emo</span>
          )}
          {emoCount > 0 && magiCount > 0 && (
            <span className="text-ink-soft mx-1">/</span>
          )}
          {magiCount > 0 && (
            <span className="font-mono text-base">{magiCount} magi</span>
          )}
        </div>
        <div className="mt-3 font-pixel text-[10px] tracking-widest uppercase text-ink-soft">
          natisni karfichka za platnoto
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-32 grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-10">
        {photos.map((p, i) => (
          <PhotoTile
            key={p.id}
            photo={p}
            tilt={TILTS[i % TILTS.length]}
            onPin={() => onPin(p)}
            onUnpin={() => onUnpin(p)}
            onView={() => onView(p)}
          />
        ))}
      </div>
    </div>
  );
}

function Spark({
  className,
  rotation,
  filled,
}: {
  className: string;
  rotation: number;
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 80 80"
      className={className}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      {filled ? (
        <path
          d="M40 8 L43 36 L72 40 L43 44 L40 72 L37 44 L8 40 L37 36 Z"
          fill="currentColor"
        />
      ) : (
        <path
          d="M40 11 L47 30 L69 33 L52 47 L59 70 L40 57 L21 71 L29 47 L11 32 L33 31 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function PhotoTile({
  photo,
  tilt,
  onPin,
  onUnpin,
  onView,
}: {
  photo: Photo;
  tilt: number;
  onPin: () => void;
  onUnpin: () => void;
  onView: () => void;
}) {
  const urls = usePhotoUrl(photo.id);
  const pinned = photo.pinned_at !== null;
  return (
    <div
      className="relative bg-white border-2 border-ink shadow-[8px_8px_0_var(--ink)] p-3.5 pb-11"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <button
        onClick={onView}
        className="w-full aspect-square block bg-ink/10 cursor-zoom-in"
        style={{
          backgroundImage: urls?.thumb_url
            ? `url(${urls.thumb_url})`
            : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        aria-label="Vij snimkata"
      />
      <div className="absolute bottom-2.5 left-3.5 right-3.5 flex justify-between font-pixel text-[10px] uppercase tracking-widest text-ink-soft">
        <span className="text-ink">{photo.author}</span>
        <span>{photo.taken_at.slice(11, 16)}</span>
      </div>
      <button
        onClick={pinned ? onUnpin : onPin}
        aria-label={pinned ? "Otkachi ot platnoto" : "Zakachi na platnoto"}
        className={`absolute -top-3.5 -right-3.5 w-11 h-11 border-2 border-ink shadow-[3px_3px_0_var(--ink)] flex items-center justify-center cursor-pointer active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${
          pinned ? "bg-coral" : "bg-paper"
        }`}
        style={{ transform: "rotate(14deg)" }}
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
          <line
            x1="12"
            y1="15"
            x2="12"
            y2="22"
            stroke="#181615"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <ellipse
            cx="12"
            cy="9"
            rx="6.5"
            ry="5.8"
            fill={pinned ? "#181615" : "#FF5C39"}
            stroke="#181615"
            strokeWidth="2"
          />
          <ellipse
            cx="9.5"
            cy="7"
            rx="1.6"
            ry="1.1"
            fill={pinned ? "#FF5C39" : "#F2E8D5"}
            opacity="0.85"
          />
        </svg>
      </button>
      {pinned && (
        <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 -translate-y-[180%] bg-ink text-paper font-pixel text-[9px] tracking-widest uppercase px-1.5 py-0.5 pointer-events-none">
          zakachena
        </div>
      )}
    </div>
  );
}
