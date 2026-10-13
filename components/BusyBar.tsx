"use client";

import { useEffect, useState } from "react";
import { createBusy, Intent, isActionKey, isTrackedRequest, type BusyView } from "@/lib/busy";

/**
 * A hairline along the top of the screen that says "that click did
 * something" while a page loads or an action runs.
 *
 * Next has no hook for "something is pending, anywhere", but everything a
 * click waits on - a navigation, a refresh, a server action - is a `fetch`
 * through the global, so that's where this listens. Which requests count,
 * and when the bar appears at all, is lib/busy.ts; this is just the
 * wiring and the line itself.
 */
export function BusyBar() {
  const [view, setView] = useState<BusyView>({ visible: false, progress: 0, run: 0 });

  useEffect(() => {
    const busy = createBusy({
      onChange: setView,
      reducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    const intent = new Intent();

    // The gestures that mean "I did something" - not typing, so notes
    // autosaving in the background stay quiet.
    const onPointer = () => intent.note();
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      const target = { tag: el?.tagName ?? "", role: el?.getAttribute("role"), editable: el?.isContentEditable };
      if (isActionKey(e, target)) intent.note();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    // Browser back and forward load a page too, with no gesture in the page.
    window.addEventListener("popstate", onPointer);

    const original = window.fetch;
    const patched: typeof fetch = (input, init) => {
      // Something already under way takes its follow-up requests with it: an
      // action, then the refresh it triggers, is one piece of work.
      if (!isTrackedRequest(input, init) || !(busy.engaged() || intent.recent())) {
        return original.call(window, input, init);
      }
      const done = busy.begin();
      return original.call(window, input, init).then(
        (res) => { done(); return res; },
        (err) => { done(); throw err; },
      );
    };
    window.fetch = patched;

    return () => {
      if (window.fetch === patched) window.fetch = original;
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("popstate", onPointer);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px] print:hidden">
      {/* Keyed by run: each appearance is a new element, so it starts where it
          should instead of animating back from where the last one finished. */}
      <div
        key={view.run}
        data-busy-bar={view.visible ? "on" : "off"}
        className="h-full origin-left bg-rust-500 shadow-[0_0_8px_var(--color-rust-500)]"
        style={{
          transform: `scaleX(${view.progress})`,
          opacity: view.visible ? 1 : 0,
          // The sweep to full width, then a fade that starts just after it.
          transition: "transform 200ms ease-out, opacity 250ms ease-out 150ms",
        }}
      />
    </div>
  );
}
