/**
 * Semantic colour for a focus rating.
 *
 * A plain module (not "use client") so server components — the stats, task
 * and lecture pages — can call it. It used to live in StopDialog.tsx, a client
 * module, which server components can import but not *call*.
 */
export function focusColour(focus: number): string {
  // Band on the rounded value: focus is always displayed rounded, and a "75%"
  // coloured as if it were 74% reads as a bug.
  const f = Math.round(focus);
  if (f >= 75) return "var(--color-ok)";
  if (f >= 50) return "var(--color-warn)";
  return "var(--color-danger)";
}
