"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSession } from "@/app/actions";
import { fmtDuration, fmtDateLong, fmtHM } from "@/lib/dates";
import { resolveSplit, type SplitMode } from "@/lib/split";
import { focusColour } from "@/lib/focus";
import { backdropProps, Portal, useModal } from "@/lib/hooks/useModal";
import { Eyebrow } from "./ui";
import { SubjectSplit } from "./SubjectSplit";
import { LocationPicker } from "./LocationPicker";
import { isStudyLocation, type StudyLocation } from "@/lib/types";
import { clsx } from "@/lib/clsx";

type CourseLink = { id: string; name: string; shortName: string; colour: string; code: string };

export type EditableSession = {
  id: string;
  name: string;
  startedAt: string;
  minutes: number;
  focus: number;
  notes: string | null;
  location: string | null;
  locationNote: string | null;
  courses: { id: string; minutes: number }[];
};

/**
 * Editing a session after the fact: what it was called, where it was, how it
 * went, what it covered. The clock is deliberately missing - a logged
 * duration is the one thing that shouldn't be rewritten later.
 *
 * The split starts in "minutes" mode seeded from what's stored, so opening
 * the dialog and saving it unchanged leaves the slices exactly as they were.
 */
export function SessionEditor({
  session,
  courses,
  onClose,
}: {
  session: EditableSession;
  courses: CourseLink[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(session.name);
  const [focus, setFocus] = useState(session.focus);
  const [notes, setNotes] = useState(session.notes ?? "");
  const [location, setLocation] = useState<StudyLocation | null>(
    isStudyLocation(session.location) ? session.location : null,
  );
  const [locationNote, setLocationNote] = useState(session.locationNote ?? "");
  const [courseIds, setCourseIds] = useState<string[]>(session.courses.map((c) => c.id));
  const [splitMode, setSplitMode] = useState<SplitMode>(session.courses.length > 1 ? "minutes" : "equal");
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(session.courses.map((c) => [c.id, c.minutes])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  useModal({ onClose, initialFocus: nameRef });

  // A course picked after the fact has no stored slice; seed it with an even
  // share so the split control opens with sensible numbers.
  const toggleCourse = (id: string) => {
    setCourseIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      const next = [...ids, id];
      setWeights((w) => ({ ...w, [id]: w[id] ?? Math.round(session.minutes / next.length) }));
      return next;
    });
  };

  const submit = () => {
    setError(null);
    const minutes = resolveSplit(splitMode, session.minutes, courseIds.map((id) => weights[id] ?? 0));
    startTransition(async () => {
      const res = await updateSession({
        id: session.id,
        name,
        focus,
        notes: notes || null,
        location,
        locationNote: locationNote || null,
        courses: courseIds.map((id, i) => ({ courseId: id, minutes: minutes[i] })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const started = new Date(session.startedAt);

  return (
    <Portal>
      <div
        {...backdropProps(onClose)}
        className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-n-900/25 p-4 pt-[8vh] backdrop-blur-[2px]"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Edit session ${session.name}`}
          className="animate-scale-in w-full max-w-[520px] rounded-lg border border-n-100 bg-n-0 shadow-[var(--shadow-pop)]"
        >
          <div className="border-b border-n-100 px-5 py-3.5">
            <Eyebrow>Edit session</Eyebrow>
            <p className="font-num mt-0.5 text-[12.5px] text-n-500">
              {fmtDateLong(started)} · {fmtHM(started)} · {fmtDuration(session.minutes)}
              <span className="text-n-400"> · timing can&apos;t be changed</span>
            </p>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div>
              <Eyebrow className="mb-1.5">What</Eyebrow>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 w-full rounded-sm border border-n-200 bg-n-0 px-2.5 text-[14px] text-n-800 outline-none transition-colors duration-[120ms] focus:border-rust-400"
              />
            </div>

            <div>
              <Eyebrow className="mb-1.5">Subjects</Eyebrow>
              <div className="flex flex-wrap items-center gap-1.5">
                {courses.map((c) => {
                  const on = courseIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCourse(c.id)}
                      aria-pressed={on}
                      className={clsx(
                        "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-all duration-[180ms]",
                        on ? "border-transparent text-white" : "border-n-200 text-n-600 hover:bg-n-50",
                      )}
                      style={on ? { background: c.colour } : undefined}
                    >
                      {c.shortName}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3">
                <SubjectSplit
                  courses={courses}
                  selected={courseIds}
                  totalMinutes={session.minutes}
                  mode={splitMode}
                  weights={weights}
                  onModeChange={setSplitMode}
                  onWeightChange={(id, v) => setWeights((w) => ({ ...w, [id]: v }))}
                />
              </div>
            </div>

            <div>
              <Eyebrow className="mb-1.5">Where</Eyebrow>
              <LocationPicker
                value={location}
                note={locationNote}
                onChange={(v, n) => { setLocation(v); setLocationNote(n); }}
              />
            </div>

            <div>
              <Eyebrow className="mb-1.5">Focus</Eyebrow>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={focus}
                  onChange={(e) => setFocus(Number(e.target.value))}
                  className="h-[18px] flex-1"
                  aria-label="Focus rating out of 100"
                />
                <span className="font-num w-14 text-right text-[18px] font-semibold" style={{ color: focusColour(focus) }}>
                  {focus}%
                </span>
              </div>
            </div>

            <div>
              <Eyebrow className="mb-1.5">Notes</Eyebrow>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Anything worth remembering about this session"
                className="w-full resize-none rounded-sm border border-n-200 bg-n-0 px-2.5 py-2 text-[13px] text-n-800 outline-none transition-colors duration-[120ms] placeholder:text-n-400 focus:border-rust-400"
              />
            </div>

            {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-n-100 bg-n-25 px-5 py-3">
            <button
              onClick={onClose}
              className="rounded-md px-3 py-2 text-[13px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-100"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={pending}
              className="rounded-md bg-rust-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
