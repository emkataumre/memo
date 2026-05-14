"use client";

import { useCallback, useRef, useState } from "react";
import { useSelf } from "@/lib/self/useSelf";
import { resizeToJpegBudget } from "@/lib/image/resize";
import { makeSquareThumbnail } from "@/lib/image/thumbnail";

export type CaptureState = "idle" | "processing" | "uploading" | "error";

export interface CaptureApi {
  trigger: () => void;
  hiddenInput: React.ReactElement;
  state: CaptureState;
  error: string | null;
}

export function useCapture(onUploaded?: () => void): CaptureApi {
  const inputElRef = useRef<HTMLInputElement | null>(null);
  const self = useSelf();
  const [state, setState] = useState<CaptureState>("idle");
  const [error, setError] = useState<string | null>(null);

  const trigger = useCallback(() => {
    if (!self) return;
    inputElRef.current?.click();
  }, [self]);

  const onChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !self) return;

      setError(null);
      setState("processing");
      try {
        const [full, thumb] = await Promise.all([
          resizeToJpegBudget(file, 1600, [0.82, 0.74, 0.66], 450 * 1024),
          makeSquareThumbnail(file, 256, 0.72),
        ]);

        setState("uploading");
        const form = new FormData();
        form.append("file", full, `${Date.now()}.jpg`);
        form.append("thumb", thumb, `${Date.now()}_thumb.jpg`);
        form.append("author", self);

        const res = await fetch("/api/photos/upload", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          let msg = `status ${res.status}`;
          try {
            const data = (await res.json()) as { error?: string };
            if (data.error) msg = data.error;
          } catch {
            /* ignore */
          }
          throw new Error(msg);
        }
        setState("idle");
        onUploaded?.();
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : "upload failed");
        setTimeout(() => setState("idle"), 4000);
      }
    },
    [self, onUploaded],
  );

  const hiddenInput = (
    <input
      ref={inputElRef}
      type="file"
      accept="image/*"
      capture="environment"
      onChange={onChange}
      className="hidden"
    />
  );

  return { trigger, hiddenInput, state, error };
}
