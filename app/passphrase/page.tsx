"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MAX_LEN = 12;

export default function PassphrasePage() {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function press(d: string) {
    if (loading) return;
    if (value.length >= MAX_LEN) return;
    setError("");
    setValue((v) => v + d);
  }

  function backspace() {
    if (loading) return;
    setError("");
    setValue((v) => v.slice(0, -1));
  }

  async function submit() {
    if (loading || value.length === 0) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: value }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      setError("ne e tova.");
      setValue("");
    } catch {
      setError("greshka s mrejata.");
    }
    setLoading(false);
  }

  const dots = Array.from({ length: Math.max(value.length, 1) }, (_, i) => i);

  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <div className="w-full max-w-sm border-2 border-ink shadow-[10px_10px_0_var(--ink)] bg-paper">
        <header className="bg-ink text-paper px-3 py-1.5 flex items-center justify-between font-pixel text-xs tracking-widest uppercase">
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-coral"></span>
            memo · VHOD
          </span>
          <span className="w-4 h-4 border-2 border-paper flex items-center justify-center text-[8px]">
            ✕
          </span>
        </header>

        <div
          className="p-5"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(24,22,21,0.05) 1px, transparent 1px)",
            backgroundSize: "8px 8px",
          }}
        >
          <h1 className="font-display text-3xl leading-none mb-1">
            chuk-chuk.
          </h1>
          <p className="text-xs text-ink-soft mb-5">
            datata na purvata ni sreshta
          </p>

          {/* Display */}
          <div className="w-full bg-white border-2 border-ink px-3 py-3 mb-4 min-h-[52px] flex items-center justify-center gap-2 select-none">
            {value.length === 0 ? (
              <span className="font-pixel text-xs tracking-widest uppercase text-ink-soft">
                vavedi parola
              </span>
            ) : (
              dots.map((i) => (
                <span
                  key={i}
                  className="w-3 h-3 bg-ink rounded-full inline-block"
                />
              ))
            )}
          </div>

          {error && (
            <p className="text-coral font-pixel text-xs tracking-widest uppercase mb-3 text-center">
              {error}
            </p>
          )}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-2.5 select-none">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <Key key={d} onPress={() => press(d)} disabled={loading}>
                {d}
              </Key>
            ))}
            <Key onPress={backspace} disabled={loading} variant="ghost">
              <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                <path
                  d="M3 12 L8 6 L21 6 L21 18 L8 18 Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 9 L17 15 M17 9 L12 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </Key>
            <Key onPress={() => press("0")} disabled={loading}>
              0
            </Key>
            <Key
              onPress={submit}
              disabled={loading || value.length === 0}
              variant="primary"
            >
              {loading ? (
                "…"
              ) : (
                <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                  <path
                    d="M5 12 L19 12 M13 6 L19 12 L13 18"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </Key>
          </div>
        </div>
      </div>
    </main>
  );
}

function Key({
  children,
  onPress,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  variant?: "default" | "ghost" | "primary";
}) {
  const bg =
    variant === "primary"
      ? "bg-coral"
      : variant === "ghost"
        ? "bg-paper-deep"
        : "bg-white";
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className={`h-14 ${bg} border-2 border-ink shadow-[4px_4px_0_var(--ink)] flex items-center justify-center font-display text-2xl text-ink active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-transform select-none`}
    >
      {children}
    </button>
  );
}
