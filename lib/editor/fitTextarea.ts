/**
 * Purpose: grow a textarea to fit its text without moving the page - shared
 * by the live editor's blocks, its Markdown mode and table cells.
 *
 * Measuring means setting the height to `auto` for a moment, and for that
 * moment the box drops to its minimum and the page gets shorter. Near the
 * bottom of a page (paper notes on a course page, #25) a long block shrank it
 * past the space left below, the browser clamped the scroll position, and the
 * box jumped to the foot of the screen on every keystroke. Holding the parent
 * at its current height while measuring keeps everything outside the box
 * still.
 */

type Holder = { style: { minHeight: string }; offsetHeight: number };
type Sizable = { style: { height: string }; scrollHeight: number; parentElement: Holder | null };

export function fitTextarea(el: Sizable, floor = 0): void {
  const holder = el.parentElement;
  const heldMinHeight = holder?.style.minHeight ?? "";
  if (holder) holder.style.minHeight = `${holder.offsetHeight}px`;
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, floor)}px`;
  if (holder) holder.style.minHeight = heldMinHeight;
}
