"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cancelSovrano, stopSovrano } from "@/app/sovranoActions";
import { clsx } from "@/lib/clsx";
import { fmtDuration } from "@/lib/dates";
import { backdropProps, Portal, useModal } from "@/lib/hooks/useModal";
import { centsFor, fmtUSD, isPlatform, PLATFORM_LABEL, PLATFORMS, type Platform } from "@/lib/sovrano";
import type { SovranoProjectOption } from "@/lib/sovranoData";
import { DurationTrim } from "../DurationTrim";
import { Eyebrow } from "../ui";

/**
 * Logging a Sovrano session: what it was, which project (or a new one),
 * Sovrano or DataAnnotation, and the duration - down only, the same bar as
 * the study log. Nothing else; that's all the work needs.
 *
 * The most recently worked project is picked to start with, and each
 * project brings the platform it was last worked under.
 */
export function SovranoLogDialog({
  trackedMinutes,
  projects,
  onClose,
  onSaved,
}: {
  trackedMinutes: number;
  projects: SovranoProjectOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const first = projects[0] ?? null;
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string | null>(first?.id ?? null);
  const [creating, setCreating] = useState(projects.length === 0);
  const [newProject, setNewProject] = useState("");
  const [platform, setPlatform] = useState<Platform>(platformOf(first));
  const [minutes, setMinutes] = useState(trackedMinutes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  useModal({ onClose, initialFocus: nameRef });

  const project = creating ? null : projects.find((p) => p.id === projectId) ?? null;
  const value = project?.rateCents != null ? centsFor(minutes, project.rateCents) : null;
  const adjusted = trackedMinutes - minutes;

  const pick = (p: SovranoProjectOption) => {
    setCreating(false);
    setProjectId(p.id);
    setPlatform(platformOf(p));
    setError(null);
  };

  const submit = () => {
    if (creating ? !newProject.trim() : !projectId) {
      setError(creating ? "Name the new project." : "Pick a project.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await stopSovrano({
        name,
        projectId: creating ? null : projectId,
        newProject: creating ? newProject : null,
        platform,
        minutes,
      });
      if (res.ok) onSaved();
      else setError(res.error);
    });
  };

  // Two clicks, the second within a few seconds - as the study log does.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (!confirmDiscard) return;
    const t = setTimeout(() => setConfirmDiscard(false), 3500);
    return () => clearTimeout(t);
  }, [confirmDiscard]);
  const discard = () => {
    if (!confirmDiscard) return setConfirmDiscard(true);
    startTransition(async () => {
      await cancelSovrano();
      onSaved();
    });
  };

  const field = "h-9 w-full rounded-sm border border-n-200 bg-n-0 px-2.5 text-[14px] text-n-800 outline-none transition-colors duration-[120ms] placeholder:text-n-400 focus:border-sov-400";

  return (
    <Portal>
      <div
        className="animate-fade-in fixed inset-0 z-[70] flex items-end justify-center bg-[var(--scrim)] p-4 backdrop-blur-[2px] sm:items-center"
        {...backdropProps(onClose)}
        role="dialog"
        aria-modal="true"
        aria-label="Log work session"
      >
        <div
          className="animate-scale-in w-full max-w-[480px] overflow-hidden rounded-lg border border-n-200 bg-n-0"
          style={{ boxShadow: "var(--shadow-modal)" }}
        >
          <div className="flex items-baseline justify-between border-b border-n-100 px-5 py-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sov-600">Sovrano</p>
              <h2 className="font-display text-[20px] font-semibold text-n-900">Log this work</h2>
            </div>
            <span className="font-num text-[13px] text-n-500">{fmtDuration(trackedMinutes)} tracked</span>
          </div>

          <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5">
            <Field label="What did you work on?">
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rubric reviews, batch 3"
                className={field}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </Field>

            <Field label="Project" hint={project && project.rateCents == null ? "No rate yet - set one on the Sovrano page to see what it's worth." : undefined}>
              <div className="flex flex-wrap gap-1.5">
                {projects.map((p) => {
                  const on = !creating && p.id === projectId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pick(p)}
                      aria-pressed={on}
                      className={clsx(
                        "rounded-[8px] border px-2.5 py-1 text-[12.5px] font-medium transition-colors duration-[120ms]",
                        on ? "border-sov-500 bg-sov-500 text-white" : "border-n-200 text-n-600 hover:border-n-300 hover:bg-n-50",
                      )}
                    >
                      {p.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setCreating(true);
                    setError(null);
                  }}
                  aria-pressed={creating}
                  className={clsx(
                    "rounded-[8px] border border-dashed px-2.5 py-1 text-[12.5px] font-medium transition-colors duration-[120ms]",
                    creating ? "border-sov-400 bg-sov-50 text-sov-700" : "border-n-300 text-n-500 hover:border-n-400 hover:text-n-700",
                  )}
                >
                  + New project
                </button>
              </div>
              {creating && (
                <input
                  autoFocus={projects.length > 0}
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="Project name"
                  aria-label="New project name"
                  className={clsx(field, "mt-2")}
                />
              )}
            </Field>

            <Field label="Platform">
              <div className="inline-flex rounded-[9px] border border-n-200 p-0.5" role="radiogroup" aria-label="Platform">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={platform === p}
                    onClick={() => setPlatform(p)}
                    className={clsx(
                      "rounded-[7px] px-3 py-1 text-[12.5px] font-semibold transition-colors duration-[120ms]",
                      platform === p ? "bg-sov-500 text-white" : "text-n-500 hover:text-n-800",
                    )}
                  >
                    {PLATFORM_LABEL[p]}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Duration"
              hint={adjusted > 0 ? `Trimmed by ${fmtDuration(adjusted)}. Can only be adjusted down.` : "Can only be adjusted down from the tracked time."}
            >
              <DurationTrim tracked={trackedMinutes} value={minutes} onChange={setMinutes} accent="sov" />
            </Field>

            {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-n-100 bg-n-25 px-5 py-3">
            <button
              onClick={discard}
              disabled={pending}
              title="Throw this session away without logging it"
              className={clsx(
                "mr-auto rounded-md border px-3 py-2 text-[13px] font-semibold transition-colors duration-[120ms] disabled:opacity-50",
                confirmDiscard ? "border-danger bg-danger-soft text-danger" : "border-transparent text-danger hover:bg-danger-soft",
              )}
            >
              {confirmDiscard ? "Click again to discard" : "Discard"}
            </button>
            <button onClick={onClose} className="rounded-md px-3 py-2 text-[13px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-100">
              Back
            </button>
            <button
              onClick={submit}
              disabled={pending}
              className="rounded-md bg-sov-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-[120ms] hover:bg-sov-600 disabled:opacity-50"
            >
              {pending ? "Saving…" : `Log ${fmtDuration(minutes)}${value != null ? ` · ${fmtUSD(value)}` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

const platformOf = (p: SovranoProjectOption | null): Platform => (p && isPlatform(p.lastPlatform) ? p.lastPlatform : "SOVRANO");

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow className="mb-1.5">{label}</Eyebrow>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-4 text-n-400">{hint}</p>}
    </div>
  );
}
