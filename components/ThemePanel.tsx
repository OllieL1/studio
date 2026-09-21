"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTheme } from "@/app/actions";
import { useTheme } from "./ThemeProvider";
import { fmtHour, THEME_MODES, type ThemeMode } from "@/lib/theme";
import { clsx } from "@/lib/clsx";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * Appearance. Picking a mode repaints straight away and saves in the
 * background - waiting for the round trip to change colour feels broken.
 */
export function ThemePanel({ darkFrom, darkTo }: { darkFrom: number; darkTo: number }) {
  const router = useRouter();
  const { mode, theme, apply } = useTheme();
  const [from, setFrom] = useState(darkFrom);
  const [to, setTo] = useState(darkTo);
  const [pending, startTransition] = useTransition();

  const save = (next: ThemeMode, f = from, t = to) => {
    apply(next);
    startTransition(async () => {
      await updateTheme(next, f, t);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {THEME_MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => save(m.key)}
            aria-pressed={mode === m.key}
            className={clsx(
              "rounded-md border px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-[120ms]",
              mode === m.key
                ? "border-transparent bg-rust-500 text-white"
                : "border-n-200 text-n-600 hover:bg-n-50 hover:text-n-800",
            )}
          >
            {m.label}
          </button>
        ))}
        <span className="ml-1 text-[11.5px] text-n-400">
          {mode === "auto"
            ? `Dark ${fmtHour(from)} to ${fmtHour(to)} · currently ${theme}`
            : THEME_MODES.find((m) => m.key === mode)?.hint}
        </span>
      </div>

      {mode === "auto" && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-n-500">
          <label className="flex items-center gap-1.5">
            Dark from
            <Hour value={from} onChange={(v) => { setFrom(v); save("auto", v, to); }} disabled={pending} />
          </label>
          <label className="flex items-center gap-1.5">
            until
            <Hour value={to} onChange={(v) => { setTo(v); save("auto", from, v); }} disabled={pending} />
          </label>
        </div>
      )}
    </div>
  );
}

function Hour({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="font-num rounded-sm border border-n-200 bg-n-0 px-1.5 py-1 text-[12px] text-n-700 outline-none focus:border-rust-400"
    >
      {HOURS.map((h) => (
        <option key={h} value={h}>{fmtHour(h)}</option>
      ))}
    </select>
  );
}
