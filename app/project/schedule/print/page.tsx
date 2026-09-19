import { getProject } from "@/lib/projectData";
import { isTaskDone } from "@/lib/progress";
import { fmtDateLongYear, fmtDayDate, startOfWeek } from "@/lib/dates";
import { Timeline } from "@/components/project/Timeline";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/** The project schedule on landscape pages: timeline, then every item by week. */
export default async function SchedulePrint() {
  const data = await getProject();
  if (!data) return <p>No project course.</p>;
  const items = [...data.timeline.items].sort((a, b) => a.end.localeCompare(b.end));
  const byWeek = new Map<number, typeof items>();
  for (const it of items) {
    const k = startOfWeek(new Date(it.end)).getTime();
    byWeek.set(k, [...(byWeek.get(k) ?? []), it]);
  }
  const KIND = { meeting: "Meeting", deadline: "Deadline", task: "Task" } as const;

  return (
    <div className="print-sheet">
      {/* Landscape just for this document. */}
      <style>{`@media print { @page { size: A4 landscape; margin: 12mm; } }`}</style>
      <div className="no-print mb-6 flex items-center justify-between rounded-lg border border-n-100 bg-n-0 p-3">
        <span className="text-[12.5px] text-n-500">Project schedule</span>
        <PrintButton auto />
      </div>

      <header className="mb-5 flex items-end justify-between border-b-2 border-n-800 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n-500">{data.course.code}</p>
          <h1 className="font-display text-[28px] font-semibold text-n-900">Project schedule</h1>
        </div>
        <p className="text-right text-[12px] text-n-500">
          Final submission {fmtDayDate(data.timeline.to)}<br />
          {data.pace.loggedHours.toFixed(1)} / {data.course.hoursTarget}h logged · printed {fmtDateLongYear(new Date())}
        </p>
      </header>

      <Timeline items={data.timeline.items} from={data.timeline.from.toISOString()} to={data.timeline.to.toISOString()} colour={data.course.colour} print />

      <section className="page-break mt-6">
        <h2 className="font-display mb-3 text-[20px] font-semibold text-n-900">By week</h2>
        {byWeek.size === 0 ? (
          <p className="text-[13px] text-n-400">Nothing scheduled yet.</p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <tbody>
              {[...byWeek.entries()].map(([week, list]) =>
                list.map((it, i) => (
                  <tr key={it.id} className="border-b border-n-100" style={{ breakInside: "avoid" }}>
                    <td className="w-[110px] py-1.5 pr-3 align-top font-semibold text-n-600">{i === 0 ? `w/b ${fmtDayDate(new Date(week))}` : ""}</td>
                    <td className="w-[80px] py-1.5 pr-3 align-top text-n-500">{KIND[it.row]}</td>
                    <td className={`py-1.5 pr-3 align-top ${it.done ? "text-n-400 line-through" : "text-n-800"}`}>{it.title}</td>
                    <td className="w-[150px] py-1.5 text-right align-top font-num text-n-500">
                      {it.row === "task" && it.start !== it.end ? `${fmtDayDate(new Date(it.start))} → ` : ""}{fmtDayDate(new Date(it.end))}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}

        {(() => {
          const undated = data.tasks.filter((t) => !t.dueAt && !t.startsAt && !isTaskDone(t));
          return undated.length > 0 ? (
            <div className="mt-6">
              <h3 className="mb-2 text-[13px] font-semibold text-n-700">Not scheduled yet</h3>
              <ul className="list-disc pl-5 text-[12px] text-n-700">
                {undated.map((t) => <li key={t.id}>{t.title}</li>)}
              </ul>
            </div>
          ) : null;
        })()}
      </section>
    </div>
  );
}
