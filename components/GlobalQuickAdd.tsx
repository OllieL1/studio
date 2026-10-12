"use client";

import { useEffect, useState } from "react";
import { QuickAdd } from "./QuickAdd";
import { backdropProps, ModalLock, Portal } from "@/lib/hooks/useModal";
import type { ParseCourse } from "@/lib/parse";

type ComposerCourse = ParseCourse & { colour: string };

/**
 * Ctrl-/ (⌘/ on a Mac) opens task creation from anywhere on the site - the
 * calendar, a lecture, a paper - not just the home and project pages, which
 * are the only two with the composer sitting inline on them.
 *
 * It's a chord, so unlike the composer's own bare "/" it fires even while a
 * text field already has focus - the same reasoning as ⌘K.
 */
export function GlobalQuickAdd({
  courses,
  calendarConnected,
}: {
  courses: ComposerCourse[];
  calendarConnected: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  return (
    <ModalLock onClose={() => setOpen(false)}>
      <Portal>
        <div
          className="animate-fade-in fixed inset-0 z-[70] flex items-start justify-center bg-[var(--scrim)] px-4 pt-[12vh] backdrop-blur-[2px]"
          {...backdropProps(() => setOpen(false))}
          role="dialog"
          aria-modal="true"
          aria-label="New task"
        >
          <div className="animate-scale-in w-full max-w-[560px]">
            <QuickAdd
              courses={courses}
              calendarConnected={calendarConnected}
              placeholder="Add a task from anywhere — try “FP programming exercise fri 5pm 20%”"
              autoFocus
            />
          </div>
        </div>
      </Portal>
    </ModalLock>
  );
}
