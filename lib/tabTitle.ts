/**
 * Purpose: the one place the running timers put their clock in the tab title,
 * shared by the study bar (TimerBar) and the work bar (SovranoBar).
 */
import { useEffect, useState } from "react";

export type TitleClaim = { title: string; priority: number };

export const TITLE_PRIORITY = { study: 1, work: 2 } as const;

export function winningTitle(claims: Iterable<TitleClaim>): string | null {
  let winner: TitleClaim | null = null;
  for (const claim of claims) if (!winner || claim.priority > winner.priority) winner = claim;
  return winner?.title ?? null;
}

const claims = new Map<symbol, TitleClaim>();
let observer: MutationObserver | null = null;
let pageTitle = "";
let writtenTitle: string | null = null;

function syncTitle() {
  const currentTitle = document.title;
  if (currentTitle && currentTitle !== writtenTitle) pageTitle = currentTitle;
  writtenTitle = winningTitle(claims.values()) ?? pageTitle;
  if (writtenTitle && writtenTitle !== currentTitle) document.title = writtenTitle;

  // A server refresh puts the page's own title back, so watch the head and
  // reapply before the browser paints it.
  if (claims.size > 0 && !observer) {
    observer = new MutationObserver(syncTitle);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
  } else if (claims.size === 0) {
    observer?.disconnect();
    observer = null;
  }
}

/** Hold the tab title while `title` isn't null; the highest priority wins. */
export function useTabTitle(title: string | null, priority: number) {
  const [key] = useState(() => Symbol("tabTitle"));

  useEffect(() => {
    if (title == null) claims.delete(key);
    else claims.set(key, { title, priority });
    syncTitle();
  }, [key, title, priority]);

  useEffect(
    () => () => {
      claims.delete(key);
      syncTitle();
    },
    [key],
  );
}
