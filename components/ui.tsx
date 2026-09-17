import { clsx } from "@/lib/clsx";

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
          style={{ background: accent }}
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
        style={{ width: `${pct}%`, background: colour ?? "var(--color-rust-500)" }}
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
    ok: "bg-ok-soft text-[#3f5c38] border-[#cfdcca]",
    warn: "bg-warn-soft text-[#7a5f16] border-[#e6d5a6]",
    danger: "bg-danger-soft text-[#7a3245] border-[#e6c6cf]",
    info: "bg-info-soft text-[#365a7a] border-[#c6d5e2]",
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
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span
          className="font-num text-[30px] leading-9 font-semibold text-n-900"
          style={tone ? { color: tone } : undefined}
        >
          {value}
        </span>
        {unit && <span className="font-num text-[15px] font-medium text-n-400">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[12px] leading-4 text-n-500">{sub}</p>}
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
