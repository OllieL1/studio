import { fmtDuration } from "./dates";

/**
 * Named value formatters for charts.
 *
 * Charts are Client Components and the pages that use them are Server
 * Components, so a formatter can't be passed as a function prop across that
 * boundary. Pages pass one of these keys instead and the chart resolves it.
 */
export type FormatKey = "duration" | "percent" | "count";

export function formatValue(key: FormatKey, v: number): string {
  switch (key) {
    case "duration":
      return fmtDuration(v);
    case "percent":
      return `${Math.round(v)}%`;
    case "count":
    default:
      return String(Math.round(v));
  }
}

/** "2.4 MB" - file sizes in the attachment list. */
export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
