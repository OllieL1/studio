/**
 * The Studio wordmark, set entirely in the display serif. "io" keeps the rust
 * colour, so the study + IO pun is still there without a second typeface.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display inline-flex items-baseline font-semibold leading-none tracking-tight ${className}`} aria-label="Studio">
      <span aria-hidden className="text-n-900">Stud</span>
      <span aria-hidden className="text-rust-500">io</span>
    </span>
  );
}
