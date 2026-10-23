import { useId } from "react";

const STAR = "M8 1.2l2.06 4.38 4.74.6-3.48 3.3.9 4.7L8 11.9l-4.22 2.28.9-4.7L1.2 6.18l4.74-.6z";

/** One star, filled from the left by `fill` (0 to 1). */
export function Star({ fill, size = 12 }: { fill: number; size?: number }) {
  // useId's colons can break an SVG url(#…) reference.
  const id = `star${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={16 * Math.max(0, Math.min(1, fill))} height="16" />
        </clipPath>
      </defs>
      <path d={STAR} fill="var(--color-rust-200)" />
      {fill > 0 && <path d={STAR} fill="var(--color-rust-500)" clipPath={`url(#${id})`} />}
    </svg>
  );
}

/** Five stars filled to a rating, halves cut down the middle. */
export function Stars({ value, size = 12 }: { value: number | null; size?: number }) {
  if (value == null) return null;
  return (
    <span className="inline-flex items-center gap-[2px]" role="img" aria-label={`${value} out of 5`}>
      {[0, 1, 2, 3, 4].map((k) => <Star key={k} fill={value - k} size={size} />)}
    </span>
  );
}
