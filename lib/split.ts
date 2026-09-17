/**
 * Apportioning a session's minutes across the subjects it covered.
 *
 * The invariant everything else relies on: the slices always sum to exactly
 * the session total. Naive rounding breaks that — 50m across 3 subjects gives
 * 16.67 each, which rounds to 17+17+17 = 51. So this uses largest-remainder
 * apportionment: floor everything, then hand the leftover minutes to whichever
 * subjects were rounded down hardest.
 */

export type SplitMode = "equal" | "percent" | "minutes";

export const SPLIT_MODE_LABEL: Record<SplitMode, string> = {
  equal: "Equal",
  percent: "Percent",
  minutes: "Time",
};

/**
 * Distribute `total` minutes across `weights` in proportion, returning whole
 * minutes that sum to exactly `total`.
 *
 * Ties in the remainder are broken by original order, so the result is stable
 * and never depends on object key ordering.
 */
export function distributeMinutes(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];

  const safeTotal = Math.max(0, Math.round(total));
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = clean.reduce((a, b) => a + b, 0);

  // No usable weights (all zero/invalid) — fall back to an even split rather
  // than silently dropping the session's time.
  if (sum <= 0) return evenSplit(safeTotal, n);

  const exact = clean.map((w) => (w / sum) * safeTotal);
  const floors = exact.map(Math.floor);
  let remainder = safeTotal - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
    out[order[k].i]++;
  }
  return out;
}

/** An even split that still sums exactly — the first few get the remainder. */
export function evenSplit(total: number, n: number): number[] {
  if (n <= 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  const base = Math.floor(safeTotal / n);
  const extra = safeTotal - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Resolve whatever the user chose in the UI into final per-subject minutes.
 *
 * - `equal`   — ignore the weights entirely, split evenly.
 * - `percent` — weights are percentages; proportional, so they need not sum
 *               to exactly 100 (the UI nudges toward 100 but never blocks).
 * - `minutes` — weights are minutes. If they don't sum to the session total
 *               they're scaled proportionally, so the total always wins.
 */
export function resolveSplit(
  mode: SplitMode,
  total: number,
  weights: number[],
): number[] {
  if (mode === "equal") return evenSplit(total, weights.length);
  return distributeMinutes(total, weights);
}
