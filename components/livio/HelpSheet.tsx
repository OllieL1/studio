"use client";

import { backdropProps, ModalLock, Portal } from "@/lib/hooks/useModal";
import { Eyebrow } from "../ui";
import { Kbd } from "./Kbd";

export type HelpSection = { title: string; rows: [keys: string[], what: string][] };

/** `:help` / `?`: every shortcut on the page, grouped. */
export function HelpSheet({ sections, onClose }: { sections: HelpSection[]; onClose: () => void }) {
  return (
    <ModalLock onClose={onClose}>
      <Portal>
        <div
          className="animate-fade-in fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[var(--scrim)] px-4 py-[10vh] backdrop-blur-[2px]"
          {...backdropProps(onClose)}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <div className="animate-scale-in w-full max-w-[640px] rounded-lg border border-n-100 bg-n-0 p-6 shadow-[var(--shadow-modal)]">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-[22px] font-semibold tracking-tight text-n-900">Keyboard</h2>
              <span className="text-[12px] text-n-400">
                <Kbd>esc</Kbd> to close
              </span>
            </div>
            <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {sections.map((s) => (
                <section key={s.title}>
                  <Eyebrow className="mb-2">{s.title}</Eyebrow>
                  <dl className="space-y-1.5">
                    {s.rows.map(([keys, what]) => (
                      <div key={what} className="flex items-baseline justify-between gap-4 text-[12.5px]">
                        <dt className="text-n-600">{what}</dt>
                        <dd className="flex shrink-0 gap-1">
                          {keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </div>
        </div>
      </Portal>
    </ModalLock>
  );
}
