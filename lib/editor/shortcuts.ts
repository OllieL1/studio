/**
 * The Live / Markdown switch. ⌥M is the one that always arrives - Chrome and
 * Edge keep ⌘⇧M / Ctrl-Shift-M for their profile menu, so on those the page
 * never sees it. ⌘⇧M still works where the browser lets it through. Both by
 * physical key: Shift changes `e.key`, and Option+M types "µ" on a Mac.
 */
export const MODE_SHORTCUT = "⌥M";

type Keys = { code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };

export function isModeToggle(e: Keys): boolean {
  if (e.code !== "KeyM") return false;
  const alt = e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
  const modShift = (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey;
  return alt || modShift;
}
