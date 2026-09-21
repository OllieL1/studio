import type { Theme } from "./theme";

/**
 * Course colours, per theme.
 *
 * The light set is what's stored on each course. On a dark page those read as
 * mud - a deep green on near-black is barely a colour - so each one has a
 * lighter counterpart with the same hue.
 *
 * Both sets were computed, not chosen: the dark set was searched in OKLCH
 * (hue held within a few degrees, saturation held near the original so the
 * palette stays muted) against the checks in scripts/palette/, and passes all
 * five on the dark surface - lightness band, chroma floor, colourblind and
 * normal-vision separation of adjacent pairs, and 3:1 contrast.
 *
 * Adjacent pairs are what the checks cover, so the order here is course order.
 */
const PAIRS: [light: string, dark: string][] = [
  ["#8A4430", "#9D4F43"], // Coaching
  ["#B28944", "#B5893E"], // PSI
  ["#3D6924", "#44732E"], // RMT
  ["#0C9F8B", "#22A891"], // Placement
  ["#2D6FA0", "#2770A2"], // FP
  ["#A284C6", "#A77BD0"], // CP
  ["#A35760", "#9D4F61"], // Project
  ["#A68E30", "#A18E30"], // ASP
  ["#93474F", "#A25052"], // ANS
  ["#4F63A0", "#6D84C9"], // SPRE
];

const TO_DARK = new Map(PAIRS.map(([l, d]) => [l.toUpperCase(), d]));
const DARK_SET = new Set(PAIRS.map(([, d]) => d.toUpperCase()));

/**
 * The colour to draw with under the current theme.
 *
 * Idempotent: a colour that's already the dark counterpart comes back
 * unchanged, so it's safe to apply at several layers. An unknown colour - one
 * typed in by hand later - is lightened arithmetically rather than left dark.
 */
export function tint(colour: string | null | undefined, theme: Theme): string {
  if (!colour) return colour ?? "";
  if (theme === "light") return colour;

  const key = colour.trim().toUpperCase();
  const mapped = TO_DARK.get(key);
  if (mapped) return mapped;
  if (DARK_SET.has(key)) return colour;
  return lighten(colour);
}

/** The light-mode colour for a stored value, whichever theme it came from. */
export function lightOf(colour: string): string {
  const key = colour.trim().toUpperCase();
  const pair = PAIRS.find(([, d]) => d.toUpperCase() === key);
  return pair ? pair[0] : colour;
}

/**
 * Raise a colour's lightness towards the dark-mode band, keeping its hue.
 * Only used for colours outside the known palette.
 */
function lighten(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);

  // Perceived lightness, cheaply: if it's already bright, leave it be.
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  if (lum > 0.38) return hex;

  const mix = 0.38 - lum; // how far short it falls
  const out = rgb.map((v) => Math.min(1, v + (1 - v) * mix * 1.6));
  return `#${out.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * A course colour as CSS, indirected through a variable so the browser swaps
 * it when the theme changes.
 *
 * This is a pure string transform - no hook, no context - so server and client
 * components can both use it, and a theme flip needs no re-render. The hex
 * stays as the fallback, which is also what an unknown colour returns.
 *
 * PDFs must NOT use this: they have no stylesheet, and they're always light.
 */
export function cssColour(colour: string | null | undefined): string {
  if (!colour) return "";
  const key = colour.trim().toUpperCase();
  if (!TO_DARK.has(key) && !DARK_SET.has(key)) return colour;
  const light = DARK_SET.has(key) ? lightOf(colour) : colour;
  return `var(--c-${light.trim().slice(1).toLowerCase()}, ${light})`;
}

/** Every colour the seed assigns, in course order - used by the palette tests. */
export const LIGHT_PALETTE = PAIRS.map(([l]) => l);
export const DARK_PALETTE = PAIRS.map(([, d]) => d);
