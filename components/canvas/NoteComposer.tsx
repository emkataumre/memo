"use client";

import { useState } from "react";
import type { NoteColor } from "@/lib/types";

const COLORS: NoteColor[] = ["lemon", "pink", "sky", "mint"];

const COLOR_BG: Record<NoteColor, string> = {
  lemon: "bg-lemon",
  pink: "bg-pink",
  sky: "bg-sky",
  mint: "bg-mint",
};

const COLOR_DOT: Record<NoteColor, string> = {
  lemon: "bg-lemon",
  pink: "bg-pink",
  sky: "bg-sky",
  mint: "bg-mint",
};

interface Props {
  x: number;
  y: number;
  rotation: number;
  initialColor: NoteColor;
  onSubmit: (body: string, color: NoteColor) => void;
  onCancel: () => void;
}

export default function NoteComposer({
  x,
  y,
  rotation,
  initialColor,
  onSubmit,
  onCancel,
}: Props) {
  const [text, setText] = useState("");
  const [color, setColor] = useState<NoteColor>(initialColor);

  function commit() {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      onCancel();
    } else {
      onSubmit(trimmed, color);
    }
  }

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `rotate(${rotation}deg)`,
      }}
      className={`w-52 border-2 border-ink ${COLOR_BG[color]} shadow-[6px_6px_0_var(--ink)] font-mono`}
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        placeholder="write something…"
        className="w-full p-5 pb-2 bg-transparent text-base resize-none focus:outline-none min-h-24 placeholder:opacity-40"
        rows={3}
      />
      <div
        className="flex items-center justify-between px-3 pb-3 pt-1"
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={(e) => {
                e.preventDefault();
                setColor(c);
              }}
              aria-label={c}
              className={`w-5 h-5 border-2 ${COLOR_DOT[c]} ${
                c === color ? "border-ink" : "border-ink/30"
              } cursor-pointer`}
            />
          ))}
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            commit();
          }}
          className="font-pixel text-[10px] tracking-widest uppercase px-2 py-1 border-2 border-ink bg-paper cursor-pointer"
        >
          post →
        </button>
      </div>
    </div>
  );
}
