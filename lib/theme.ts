/**
 * Light and dark.
 *
 * "auto" turns dark on in the evening and off again in the morning, which is
 * a window that wraps midnight - so the comparison has to handle 21:00-07:00
 * as one span, not two. Everything here is pure: the layout resolves the
 * theme on the server (no flash), and the client re-resolves at the boundary
 * so a tab left open flips by itself.
 */

export type ThemeMode = "auto" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_MODES: { key: ThemeMode; label: string; hint: string }[] = [
  { key: "auto", label: "Auto", hint: "Dark in the evening" },
  { key: "light", label: "Light", hint: "Always light" },
  { key: "dark", label: "Dark", hint: "Always dark" },
];

export const DEFAULT_DARK_FROM = 21;
export const DEFAULT_DARK_TO = 7;

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === "auto" || v === "light" || v === "dark";
}

/** An hour clamped to 0-23, for values coming from the database or a form. */
export const cleanHour = (h: number, fallback: number): number =>
  Number.isFinite(h) && h >= 0 && h <= 23 ? Math.floor(h) : fallback;

/** Is `now` inside the dark window? The window may wrap past midnight. */
export function inDarkWindow(now: Date, from: number, to: number): boolean {
  if (from === to) return false; // an empty window, not a whole day
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = from * 60;
  const end = to * 60;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function resolveTheme(
  mode: ThemeMode,
  now: Date,
  from = DEFAULT_DARK_FROM,
  to = DEFAULT_DARK_TO,
): Theme {
  if (mode === "light" || mode === "dark") return mode;
  return inDarkWindow(now, from, to) ? "dark" : "light";
}

/**
 * When the automatic theme next changes, so a tab that's open across the
 * boundary can flip itself without polling every second.
 */
export function nextFlip(now: Date, from: number, to: number): Date | null {
  if (from === to) return null;
  const at = (hour: number) => {
    const d = new Date(now);
    d.setHours(hour, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  };
  const candidates = [at(from), at(to)].sort((a, b) => a.getTime() - b.getTime());
  return candidates[0];
}

/** "21:00" for a whole hour. */
export const fmtHour = (h: number): string => `${String(h).padStart(2, "0")}:00`;
