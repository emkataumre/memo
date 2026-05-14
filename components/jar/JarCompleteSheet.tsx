"use client";

import { useRef, useState } from "react";
import type { Author, DateIdea } from "@/lib/types";
import { resizeToWebpBudget } from "@/lib/image/resize";
import { makeSquareThumbnail } from "@/lib/image/thumbnail";

interface Props {
  self: Author;
  idea: DateIdea;
  onCancel: () => void;
  onCompleted: () => void;
}

const MAX_CAPTION = 500;

type Phase = "idle" | "processing" | "uploading" | "saving" | "error";

// Sheet shown when the user taps "log it" on the pending date banner.
// Two optional fields: a photo (snapped or picked from library) and a
// caption. Saving:
//   1. If a photo was provided, runs through the same compress pipeline
//      as the daily camera and POSTs to /api/photos/upload with the
//      dateIdeaId so the photo is bound to this date (skips reveal cycle).
//   2. Calls /api/jar/complete to flip the idea to completed.
// Either step failing leaves the banner in place; the user can retry.
export default function JarCompleteSheet({
  self,
  idea,
  onCancel,
  onCompleted,
}: Props) {
  const [caption, setCaption] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoBlobRef = useRef<Blob | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    photoBlobRef.current = file;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    photoBlobRef.current = null;
  }

  async function submit() {
    if (phase === "processing" || phase === "uploading" || phase === "saving") {
      return;
    }
    setError(null);

    try {
      // 1. Photo (optional).
      if (photoBlobRef.current) {
        setPhase("processing");
        const file = photoBlobRef.current;
        const [full, thumb] = await Promise.all([
          resizeToWebpBudget(file, 1600, [0.82, 0.74, 0.66], 450 * 1024),
          makeSquareThumbnail(file, 256, 0.72),
        ]);

        setPhase("uploading");
        const form = new FormData();
        form.append("file", full, `${Date.now()}.webp`);
        form.append("thumb", thumb, `${Date.now()}_thumb.webp`);
        form.append("author", self);
        form.append("dateIdeaId", idea.id);
        const trimmed = caption.trim();
        if (trimmed.length > 0) form.append("caption", trimmed);

        const upRes = await fetch("/api/photos/upload", {
          method: "POST",
          body: form,
        });
        if (!upRes.ok) {
          const data = (await upRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error ?? `upload failed (${upRes.status})`);
        }
      }

      // 2. Mark the date completed.
      setPhase("saving");
      const trimmed = caption.trim();
      const completeRes = await fetch("/api/jar/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: idea.id,
          caption: trimmed.length > 0 ? trimmed : null,
        }),
      });
      if (!completeRes.ok) {
        const data = (await completeRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `complete failed (${completeRes.status})`);
      }

      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
      setPhase("error");
    }
  }

  const busy =
    phase === "processing" || phase === "uploading" || phase === "saving";
  const busyLabel =
    phase === "processing"
      ? "compressing…"
      : phase === "uploading"
        ? "uploading…"
        : phase === "saving"
          ? "saving…"
          : "save";

  return (
    <div
      className="fixed inset-0 z-[200] bg-ink/80 flex items-center justify-center p-5"
      onClick={busy ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-paper border-2 border-ink shadow-[10px_10px_0_var(--coral)] max-h-[90vh] overflow-y-auto"
      >
        <header className="bg-ink text-paper px-3 py-1.5 flex items-center justify-between font-pixel text-[11px] tracking-widest uppercase sticky top-0 z-10">
          <span>log date</span>
          <button
            onClick={onCancel}
            disabled={busy}
            className="w-4 h-4 border-2 border-paper flex items-center justify-center text-[8px] cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="p-5">
          <div className="bg-white border-2 border-ink shadow-[3px_3px_0_var(--ink)] p-3 mb-5">
            <div className="font-pixel text-[9px] tracking-widest uppercase text-coral mb-1">
              the date
            </div>
            <div className="font-display text-xl leading-tight text-ink whitespace-pre-wrap break-words">
              {idea.body}
            </div>
          </div>

          {/* Photo */}
          <label className="font-pixel text-[10px] tracking-widest uppercase text-ink block mb-2">
            photo · optional
          </label>
          {photoPreview ? (
            <div className="relative mb-4">
              <div className="w-full aspect-video bg-ink-deep border-2 border-ink overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="Selected for date log"
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                onClick={clearPhoto}
                disabled={busy}
                className="absolute top-2 right-2 px-2 py-1 border-2 border-paper bg-ink text-paper font-pixel text-[9px] tracking-widest uppercase cursor-pointer active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
              >
                remove
              </button>
            </div>
          ) : (
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.removeAttribute("capture");
                    fileInputRef.current.click();
                  }
                }}
                disabled={busy}
                className="px-3 py-4 border-2 border-ink bg-paper-deep font-pixel text-[10px] tracking-widest uppercase cursor-pointer active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50"
              >
                pick from library
              </button>
              <button
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.setAttribute(
                      "capture",
                      "environment",
                    );
                    fileInputRef.current.click();
                  }
                }}
                disabled={busy}
                className="px-3 py-4 border-2 border-ink bg-paper-deep font-pixel text-[10px] tracking-widest uppercase cursor-pointer active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50"
              >
                snap one
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onPickPhoto}
            className="hidden"
          />

          {/* Caption */}
          <label className="font-pixel text-[10px] tracking-widest uppercase text-ink block mb-2">
            caption · optional
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
            placeholder="what happened. how it felt."
            rows={3}
            className="w-full bg-white border-2 border-ink p-3 font-mono text-sm resize-none focus:outline-none focus:border-coral"
          />
          <div className="mt-1 font-pixel text-[9px] tracking-widest uppercase text-ink-soft text-right">
            {caption.length} / {MAX_CAPTION}
          </div>

          {error && (
            <p className="mt-3 text-coral font-pixel text-[10px] tracking-widest uppercase">
              {error}
            </p>
          )}

          <div className="mt-5 flex gap-2 justify-end">
            <button
              onClick={onCancel}
              disabled={busy}
              className="px-3 py-2 border-2 border-ink bg-paper-deep font-pixel text-[10px] tracking-widest uppercase cursor-pointer active:translate-x-[2px] active:translate-y-[2px] disabled:opacity-50"
            >
              cancel
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="px-3 py-2 border-2 border-ink bg-coral text-ink font-pixel text-[10px] tracking-widest uppercase shadow-[3px_3px_0_var(--ink)] cursor-pointer active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busyLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
