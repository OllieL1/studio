"use client";

import { useEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Shared behaviour for every modal dialog.
 *
 * Built after a Safari bug where dismissing a dialog left the page scrolled
 * down. Three things could cause that, so all three are handled:
 *
 * 1. **Scroll lock.** The page can't scroll behind an open dialog, and on
 *    close the exact previous scroll position is restored — whatever moved
 *    it in between.
 * 2. **Focus without scrolling.** The first field is focused with
 *    `preventScroll`, because Safari scrolls the document when focusing an
 *    input inside a fixed, still-animating overlay.
 * 3. **Click-to-dismiss, not mousedown.** See `backdropProps`: closing on
 *    mousedown removed the overlay mid-click, so the click then landed on
 *    whatever was underneath (a calendar cell).
 */
export function useModal({
  onClose,
  initialFocus,
}: {
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const html = document.documentElement;
    const scrollY = window.scrollY;
    const prev = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };

    // Compensate for the scrollbar disappearing, so the page doesn't shift sideways.
    const scrollbar = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`;

    initialFocus?.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prev.overflow;
      html.style.paddingRight = prev.paddingRight;
      // Restore after the style change applies, so nothing fights it.
      window.scrollTo({ top: scrollY, behavior: "instant" as ScrollBehavior });
    };
    // Mount/unmount only: the lock must span the dialog's whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Props for a modal's backdrop. Dismisses only when a click both starts and
 * ends on the backdrop itself — not on mousedown (which let the click fall
 * through to the page), and not when a text selection drag inside the dialog
 * happens to be released over the backdrop.
 */
export function backdropProps(onClose: () => void) {
  let downOnBackdrop = false;
  return {
    onMouseDown: (e: React.MouseEvent) => {
      downOnBackdrop = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (downOnBackdrop && e.target === e.currentTarget) {
        e.stopPropagation();
        onClose();
      }
      downOnBackdrop = false;
    },
  };
}

/**
 * Applies useModal to whatever it wraps — for components that stay mounted
 * and only render their dialog conditionally (e.g. the ⌘K palette).
 */
export function ModalLock({
  onClose,
  initialFocus,
  children,
}: {
  onClose: () => void;
  initialFocus?: RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  useModal({ onClose, initialFocus });
  return children;
}

/**
 * Renders a dialog straight into <body>.
 *
 * Without this, a dialog inherits its ancestors' stacking: any ancestor with
 * a transform — including a fade-in animation — becomes the containing block
 * for `position: fixed`, trapping the "full-screen" overlay inside it while
 * later page content paints on top. That's how the task editor's Save button
 * ended up underneath a card (18 Sep 2026).
 *
 * Only for dialogs that open on interaction, never during server render —
 * `document` must exist on first render.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
