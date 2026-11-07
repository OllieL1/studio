import { clsx } from "@/lib/clsx";
import { cssColour } from "@/lib/palette";

/* Small presentational primitives shared across pages. Kept in one file
   because each is a handful of lines and they're always used together. */

export function Card({
  className,
  children,
  accent,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { accent?: string }) {
  return (
    <div
      className={clsx("card relative overflow-hidden", className)}
      {...rest}
    >
      {accent && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: cssColour(accent) }}
        />
      )}
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={clsx("eyebrow", className)}>{children}</p>;
}

export function SectionHeading({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-[26px] leading-8 font-semibold text-n-800">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] leading-5 text-n-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** The progress bar. Squared track, animated fill, always paired with a
 *  numeral — colour never carries the value alone. */
export function ProgressBar({
  value,
  colour,
  height = 6,
  track = "var(--color-n-200)",
  className,
}: {
  value: number;
  colour?: string;
  height?: number;
  track?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={clsx("w-full overflow-hidden rounded-full", className)}
      style={{ height, background: track }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="bar-fill h-full rounded-full"
        style={{ width: `${pct}%`, background: cssColour(colour) || "var(--color-rust-500)" }}
      />
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info" | "rust";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-n-50 text-n-600 border-n-200",
    ok: "bg-ok-soft text-ok-ink border-[#cfdcca]",
    warn: "bg-warn-soft text-warn-ink border-[#e6d5a6]",
    danger: "bg-danger-soft text-danger-ink border-[#e6c6cf]",
    info: "bg-info-soft text-info-ink border-[#c6d5e2]",
    rust: "bg-rust-100 text-rust-700 border-rust-200",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A big headline metric. The numeral is mono so digits never jitter. */
export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
  text = false,
  fit = false,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
  tone?: string;
  /** For a name rather than a number: display face, smaller, one line. */
  text?: boolean;
  /** Every line stays one line: the number scales down with the column
   *  (container units) rather than wrapping, and label and sub never break. */
  fit?: boolean;
}) {
  return (
    <div className={clsx("min-w-0", fit && "@container")}>
      <Eyebrow className={clsx(fit && "truncate whitespace-nowrap")}>{label}</Eyebrow>
      <p className={clsx("mt-1.5 flex min-w-0 items-baseline gap-1", fit && "whitespace-nowrap")}>
        <span
          className={
            text
              ? "font-display truncate text-[22px] leading-9 font-semibold text-n-900"
              : clsx("font-num leading-9 font-semibold text-n-900", fit ? "text-[length:clamp(20px,20cqi,30px)]" : "text-[30px]")
          }
          style={tone ? { color: tone } : undefined}
          title={text ? value : undefined}
        >
          {value}
        </span>
        {unit && <span className="font-num text-[15px] font-medium text-n-400">{unit}</span>}
      </p>
      {sub && (
        <p
          className={clsx("mt-0.5 text-[12px] leading-4 text-n-500", fit && "truncate whitespace-nowrap")}
          title={fit && typeof sub === "string" ? sub : undefined}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="font-display text-[19px] leading-7 font-semibold text-n-700">{title}</p>
      {body && <p className="mt-1 max-w-[42ch] text-[13px] leading-5 text-n-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
