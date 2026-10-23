"use client";

import { backdropProps, ModalLock, Portal } from "@/lib/hooks/useModal";

/** A panel from the right for one row's detail. Esc or a click outside closes it. */
export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <ModalLock onClose={onClose}>
      <Portal>
        <div
          className="animate-fade-in fixed inset-0 z-[70] flex justify-end bg-[var(--scrim)]"
          {...backdropProps(onClose)}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div className="animate-slide-in flex h-full w-full max-w-[460px] flex-col overflow-y-auto border-l border-n-100 bg-n-0 shadow-[var(--shadow-modal)]">
            {children}
          </div>
        </div>
      </Portal>
    </ModalLock>
  );
}
