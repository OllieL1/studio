import { APP_NAME, type App } from "@/lib/apps";

const STEM: Record<App, string> = { studio: "Stud", livio: "Liv" };

/**
 * The wordmark, set entirely in the display serif. "io" takes the app's
 * accent - rust in Studio, violet in Livio - so the study/living + IO pun is
 * still there without a second typeface.
 */
export function Wordmark({ app = "studio", className = "" }: { app?: App; className?: string }) {
  return (
    <span className={`font-display inline-flex items-baseline font-semibold leading-none tracking-tight ${className}`} aria-label={APP_NAME[app]}>
      <span aria-hidden className="text-n-900">{STEM[app]}</span>
      <span aria-hidden className="text-rust-500">io</span>
    </span>
  );
}
