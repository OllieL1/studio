"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { tint } from "@/lib/palette";
import { nextFlip, resolveTheme, type Theme, type ThemeMode } from "@/lib/theme";

/**
 * Which theme the client thinks it's in.
 *
 * The server already resolved it and wrote it onto <html>, so this starts
 * from that value and never causes a flash. Its jobs are the two things the
 * server can't do: flip at the boundary while a tab sits open overnight, and
 * hand components the colour to draw a course in.
 */

type Ctx = {
  theme: Theme;
  mode: ThemeMode;
  /** The colour a course should be drawn in under this theme. */
  tint: (colour: string | null | undefined) => string;
  /** Apply a mode immediately - the settings toggle, before the server catches up. */
  apply: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<Ctx>({
  theme: "light",
  mode: "auto",
  tint: (c) => c ?? "",
  apply: () => {},
});

export const useTheme = () => useContext(ThemeContext);

/** The colour to draw a course in, under the current theme. */
export function useTint() {
  return useContext(ThemeContext).tint;
}

export function ThemeProvider({
  initial,
  mode: initialMode,
  darkFrom,
  darkTo,
  children,
}: {
  initial: Theme;
  mode: ThemeMode;
  darkFrom: number;
  darkTo: number;
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  // The server is the source of truth on navigation; adopt what it sent.
  useEffect(() => {
    setTheme(initial);
    setMode(initialMode);
  }, [initial, initialMode]);

  const paint = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }, []);

  const apply = useCallback(
    (next: ThemeMode) => {
      setMode(next);
      paint(resolveTheme(next, new Date(), darkFrom, darkTo));
    },
    [paint, darkFrom, darkTo],
  );

  // Flip at the next boundary rather than polling. A sleeping laptop wakes up
  // with a stale timer, so the visibility check re-resolves on return too.
  useEffect(() => {
    if (mode !== "auto") return;

    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const resolved = resolveTheme("auto", new Date(), darkFrom, darkTo);
      if (resolved !== document.documentElement.dataset.theme) paint(resolved);

      const at = nextFlip(new Date(), darkFrom, darkTo);
      if (!at) return;
      // setTimeout saturates past ~24 days; the window is hours, so this is
      // only a guard against a nonsense clock.
      const ms = Math.min(Math.max(at.getTime() - Date.now(), 1000), 6 * 60 * 60 * 1000);
      timer = setTimeout(schedule, ms);
    };
    schedule();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [mode, darkFrom, darkTo, paint]);

  return (
    <ThemeContext.Provider value={{ theme, mode, apply, tint: (c) => tint(c, theme) }}>
      {children}
    </ThemeContext.Provider>
  );
}
