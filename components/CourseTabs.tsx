"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/dates";
import { clsx } from "@/lib/clsx";
import { Card, Eyebrow, EmptyState } from "./ui";
import { TaskRow, type TaskRowData } from "./TaskRow";

type Week = { n: number; start: string; tasks: TaskRowData[] };

/** Course work, split into the three views that actually get used:
 *  assessed work by deadline, classes by teaching week, and anything else. */
export function CourseTabs({
  assessments,
  weeks,
  unscheduled,
  other,
}: {
  assessments: TaskRowData[];
  weeks: Week[];
  unscheduled: TaskRowData[];
  other: TaskRowData[];
}) {
  const classCount = weeks.reduce((s, w) => s + w.tasks.length, 0) + unscheduled.length;
  const tabs = [
    { key: "assessed", label: "Assessed work", count: assessments.length },
    { key: "classes", label: "Classes", count: classCount },
    ...(other.length > 0 ? [{ key: "other", label: "Other", count: other.length }] : []),
  ];
  const [tab, setTab] = useState(assessments.length > 0 ? "assessed" : "classes");
  const [hideDone, setHideDone] = useState(false);

  const isDone = (t: TaskRowData) =>
    t.items.length ? t.items.every((i) => i.doneAt) : !!t.doneAt;
  const filter = (list: TaskRowData[]) => (hideDone ? list.filter((t) => !isDone(t)) : list);

  return (
    <section className="animate-fade-up" style={{ animationDelay: "120ms" }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-0.5 rounded-md border border-n-200 bg-n-0 p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                "flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-[120ms]",
                tab === t.key ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50 hover:text-n-700",
              )}
            >
              {t.label}
              <span className={clsx("font-num text-[10.5px]", tab === t.key ? "text-white/70" : "text-n-400")}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer select-none items-center gap-2 text-[12px] text-n-500">
          <input
            type="checkbox"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-rust-500)]"
          />
          Hide completed
        </label>
      </div>

      {tab === "assessed" && (
        <Card>
          {filter(assessments).length === 0 ? (
            <EmptyState
              title={assessments.length === 0 ? "No assessed work yet." : "All done here."}
              body={
                assessments.length === 0
                  ? "Add coursework from the home page composer."
                  : "Every piece of assessed work is complete."
              }
            />
          ) : (
            filter(assessments).map((t) => <TaskRow key={t.id} task={t} showCourse={false} />)
          )}
        </Card>
      )}

      {tab === "classes" && (
        <div className="space-y-3">
          {weeks.map((w) => {
            const visible = filter(w.tasks);
            if (visible.length === 0) return null;
            const done = w.tasks.filter(isDone).length;
            return (
              <Card key={w.n}>
                <div className="flex items-baseline justify-between border-b border-n-100 px-4 py-2.5">
                  <Eyebrow>
                    Week {w.n}
                    <span className="ml-2 font-normal normal-case tracking-normal text-n-400">
                      w/b{" "}
                      {fmtDate(new Date(w.start))}
                    </span>
                  </Eyebrow>
                  <span className="font-num text-[11px] text-n-400">
                    {done}/{w.tasks.length}
                  </span>
                </div>
                {visible.map((t) => (
                  <TaskRow key={t.id} task={t} showCourse={false} />
                ))}
              </Card>
            );
          })}

          {filter(unscheduled).length > 0 && (
            <Card>
              <div className="border-b border-n-100 px-4 py-2.5">
                <Eyebrow>Outside term</Eyebrow>
              </div>
              {filter(unscheduled).map((t) => (
                <TaskRow key={t.id} task={t} showCourse={false} />
              ))}
            </Card>
          )}

          {weeks.length === 0 && unscheduled.length === 0 && (
            <Card>
              <EmptyState
                title="No classes timetabled."
                body="This course has no scheduled lectures or labs."
              />
            </Card>
          )}
        </div>
      )}

      {tab === "other" && (
        <Card>
          {filter(other).length === 0 ? (
            <EmptyState title="Nothing here." />
          ) : (
            filter(other).map((t) => <TaskRow key={t.id} task={t} showCourse={false} />)
          )}
        </Card>
      )}
    </section>
  );
}
