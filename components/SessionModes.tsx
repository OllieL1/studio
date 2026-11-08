"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pauseTimer, resumeTimer, startUltraFocus } from "@/app/actions";
import { backdropProps, ModalLock, Portal } from "@/lib/hooks/useModal";
import { LOCK_PRESETS } from "@/lib/ultraFocus";
import { clsx } from "@/lib/clsx";

export type LockCourse = { id: string; name: string; shortName: string; colour: string; isProject: boolean };

/**
 * The timer's modes, behind one button so the bar stays quiet: ultra focus,
 * full screen, and pause. Opening it fans the three out above the bar, each
 * a round icon with its name under it; they rise in one after another.
 *
 * Ultra focus asks what to lock to and for how long (UltraFocusPicker).
 * Under a lock it's shown as on, not offered again - the only ways out are
 * the time running out or the session ending.
 */
export function ModesButton({
  paused,
  locked,
  courses,
  onFullScreen,
}: {
  paused: boolean;
  locked: boolean;
  courses: LockCourse[];
  onFullScreen: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pending, startTransition] = useTransition();
  const root = useRef<HTMLDivElement>(null);

  // Away-click and Escape put the fan away.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const togglePause = () =>
    startTransition(async () => {
      await (paused ? resumeTimer() : pauseTimer());
      router.refresh();
    });

  const options: { key: string; label: string; icon: React.ReactNode; on?: boolean; act: () => void; disabled?: boolean }[] = [
    {
      key: "ultra",
      label: locked ? "Ultra focus on" : "Ultra focus",
      icon: <UltraIcon />,
      on: locked,
      disabled: locked,
      act: () => setPicking(true),
    },
    { key: "full", label: "Full screen", icon: <FullScreenIcon />, act: onFullScreen },
    { key: "pause", label: paused ? "Resume" : "Pause", icon: paused ? <PlayIcon /> : <PauseIcon />, on: paused, act: togglePause },
  ];

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Session modes"
        aria-expanded={open}
        title="Ultra focus, full screen, pause"
        className={clsx(
          "flex h-8 w-8 items-center justify-center rounded-full transition-[color,background-color,transform] duration-[180ms]",
          open ? "bg-n-100 text-n-800" : locked ? "text-rust-600 hover:bg-n-50" : "text-n-400 hover:bg-n-50 hover:text-n-700",
        )}
      >
        <ModesIcon open={open} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-1/2 mb-4 flex -translate-x-1/2 items-start gap-1.5 rounded-[22px] border border-n-200 bg-n-0/95 p-2 backdrop-blur-md"
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          {options.map((o, i) => (
            <button
              key={o.key}
              role="menuitem"
              disabled={o.disabled || (o.key === "pause" && pending)}
              onClick={() => {
                setOpen(false);
                o.act();
              }}
              className="group animate-fan-in flex w-[76px] flex-col items-center gap-1.5 rounded-2xl px-1 pb-1.5 pt-2 transition-colors duration-[120ms] hover:bg-n-50 disabled:cursor-default disabled:hover:bg-transparent"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <span
                className={clsx(
                  "flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-[180ms] group-enabled:group-hover:scale-105",
                  o.on ? "bg-rust-500 text-white" : "bg-n-100 text-n-700",
                )}
              >
                {o.icon}
              </span>
              <span className={clsx("whitespace-nowrap text-[11px] font-semibold", o.on ? "text-rust-600" : "text-n-600")}>{o.label}</span>
            </button>
          ))}
        </div>
      )}

      {picking && <UltraFocusPicker courses={courses} onClose={() => setPicking(false)} />}
    </div>
  );
}

/**
 * Pick what to lock Studio to and for how long. A course locks to its page,
 * lectures and tasks; the project to everything under Project.
 */
function UltraFocusPicker({ courses, onClose }: { courses: LockCourse[]; onClose: () => void }) {
  const router = useRouter();
  const [courseId, setCourseId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number>(50);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const first = useRef<HTMLButtonElement>(null);
  // Project first: it's the one with the most hours to find.
  const ordered = [...courses].sort((a, b) => Number(b.isProject) - Number(a.isProject));

  const start = () => {
    if (!courseId) return;
    startTransition(async () => {
      const res = await startUltraFocus(courseId, minutes);
      if (!res.ok) return setError(res.error);
      onClose();
      // The proxy takes it from here: refreshing lands on the locked page.
      router.refresh();
    });
  };

  return (
    <Portal>
      <ModalLock onClose={onClose} initialFocus={first}>
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-n-900/25 p-4 pb-28 backdrop-blur-[2px] animate-fade-in" {...backdropProps(onClose)}>
          <div role="dialog" aria-label="Ultra focus" className="animate-rise-in w-full max-w-[420px] rounded-2xl border border-n-200 bg-n-0 p-5" style={{ boxShadow: "var(--shadow-pop)" }}>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rust-500 text-white">
                <UltraIcon />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold text-n-900">Ultra focus</h2>
                <p className="text-[12px] text-n-500">Studio shows only this, until the time&apos;s up or you end the session.</p>
              </div>
            </div>

            <p className="eyebrow mt-5 mb-2">Lock to</p>
            <div className="flex flex-wrap gap-1.5">
              {ordered.map((c, i) => (
                <button
                  key={c.id}
                  ref={i === 0 ? first : undefined}
                  onClick={() => setCourseId(c.id)}
                  aria-pressed={courseId === c.id}
                  title={c.name}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold transition-colors duration-[120ms]",
                    courseId === c.id ? "border-rust-400 bg-rust-50 text-rust-700" : "border-n-200 text-n-700 hover:bg-n-50",
                  )}
                >
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: c.colour }} />
                  {c.isProject ? "Project" : c.shortName}
                </button>
              ))}
            </div>

            <p className="eyebrow mt-4 mb-2">For</p>
            <div className="grid grid-cols-4 gap-1.5">
              {LOCK_PRESETS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMinutes(m)}
                  aria-pressed={minutes === m}
                  className={clsx(
                    "font-num rounded-lg border py-1.5 text-[13px] font-semibold transition-colors duration-[120ms]",
                    minutes === m ? "border-rust-400 bg-rust-50 text-rust-700" : "border-n-200 text-n-700 hover:bg-n-50",
                  )}
                >
                  {m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}h${m % 60}` : `${m / 60}h`}
                </button>
              ))}
            </div>

            {error && <p className="mt-3 text-[12px] font-medium text-danger">{error}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={onClose} className="rounded-md px-3 py-2 text-[12.5px] font-semibold text-n-600 hover:bg-n-100">
                Cancel
              </button>
              <button
                onClick={start}
                disabled={!courseId || pending}
                className="rounded-md bg-rust-500 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-50"
              >
                {pending ? "Locking…" : "Start ultra focus"}
              </button>
            </div>
          </div>
        </div>
      </ModalLock>
    </Portal>
  );
}

/* ── Icons ───────────────────────────────────────────────────────────────── */

/** Three dots that turn into a close cross when the fan is open. */
function ModesIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="transition-transform duration-[220ms]" style={{ transform: open ? "rotate(90deg)" : undefined }}>
      {open ? (
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="3" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="13" cy="8" r="1.4" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/** A target: rings closing on a point. */
function UltraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

function FullScreenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="13" height="14" viewBox="0 0 12 13" fill="none" aria-hidden>
      <path d="M2 1.8v9.4a.6.6 0 0 0 .92.5l7.4-4.7a.6.6 0 0 0 0-1L2.92 1.3a.6.6 0 0 0-.92.5Z" fill="currentColor" />
    </svg>
  );
}
