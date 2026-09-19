import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { renderMarkdown, extractToc, wordCount } from "@/lib/markdown";
import { fmtDate, fmtDateLongYear } from "@/lib/dates";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/**
 * Every typed note for a course, in lecture order, with a contents page.
 *
 * Printed via the browser (Save as PDF). Each lecture starts on a fresh page
 * and the contents list mirrors the order below it.
 */
export default async function CourseNotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const { id } = await params;
  const { all } = await searchParams;
  const includeEmpty = all === "1";

  const course = await db.course.findUnique({ where: { id } });
  if (!course) notFound();

  const lectures = await db.task.findMany({
    where: {
      courseId: id,
      kind: { in: ["LECTURE", "SEMINAR"] },
      cancelled: false,
      ...(includeEmpty ? {} : { notesMd: { not: null } }),
    },
    orderBy: [{ dueAt: "asc" }, { title: "asc" }],
  });

  const totalWords = lectures.reduce((s, l) => s + (l.notesMd ? wordCount(l.notesMd) : 0), 0);

  return (
    <div className="print-sheet mx-auto max-w-[760px]">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-n-100 bg-n-0 p-3">
        <Link
          href={`/lectures?course=${course.id}`}
          className="text-[12.5px] font-medium text-n-500 hover:text-rust-600"
        >
          ← Back to lectures
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/courses/${course.id}/notes${includeEmpty ? "" : "?all=1"}`}
            className="rounded-md border border-n-200 px-3 py-2 text-[12px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
          >
            {includeEmpty ? "Only lectures with notes" : "Include empty lectures"}
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* ── Title page ──────────────────────────────────────────────────── */}
      <header className="mb-10 border-b-2 border-n-800 pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n-500">
          {course.code}
        </p>
        <h1 className="font-display mt-2 text-[40px] leading-[46px] font-semibold tracking-tight text-n-900">
          {course.name}
        </h1>
        <p className="mt-2 text-[13px] text-n-500">
          Lecture notes · {lectures.length} lecture{lectures.length === 1 ? "" : "s"} ·{" "}
          {totalWords.toLocaleString("en-GB")} words
        </p>
        <p className="mt-0.5 text-[11.5px] text-n-400">
          Compiled {fmtDateLongYear(new Date())}
        </p>
      </header>

      {lectures.length === 0 ? (
        <p className="text-[13px] text-n-400">
          No typed notes for this course yet.
        </p>
      ) : (
        <>
          {/* ── Contents ──────────────────────────────────────────────── */}
          <section className="mb-10">
            <h2 className="font-display mb-4 text-[22px] font-semibold text-n-900">Contents</h2>
            <ol className="space-y-1.5">
              {lectures.map((l, i) => {
                const sub = l.notesMd ? extractToc(l.notesMd, 2).filter((t) => t.depth === 2) : [];
                return (
                  <li key={l.id}>
                    <a
                      href={`#lecture-${l.id}`}
                      className="flex items-baseline gap-2 text-[13.5px] text-n-800 no-underline"
                    >
                      <span className="font-num shrink-0 text-n-400">{String(i + 1).padStart(2, "0")}</span>
                      <span className="font-medium">{l.title}</span>
                      <span className="mx-1 min-w-4 flex-1 self-center border-b border-dotted border-n-300" />
                      <span className="font-num shrink-0 text-[11.5px] text-n-400">
                        {l.dueAt ? fmtDate(l.dueAt) : "-"}
                      </span>
                    </a>
                    {sub.length > 0 && (
                      <ul className="ml-7 mt-1 space-y-0.5">
                        {sub.slice(0, 6).map((t) => (
                          <li key={t.id} className="text-[11.5px] text-n-500">
                            {t.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          {/* ── The notes ─────────────────────────────────────────────── */}
          {lectures.map((l, i) => (
            <section
              key={l.id}
              id={`lecture-${l.id}`}
              className={i === 0 ? "" : "page-break pt-8"}
            >
              <header className="mb-5 border-b border-n-200 pb-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n-400">
                  {String(i + 1).padStart(2, "0")} ·{" "}
                  {l.dueAt ? fmtDate(l.dueAt) : "Unscheduled"}
                  {l.notebook && ` · ${l.notebook}${l.notebookPages ? ` pp. ${l.notebookPages}` : ""}`}
                </p>
                <h2 className="font-display mt-1.5 text-[26px] leading-8 font-semibold text-n-900">
                  {l.title}
                </h2>
              </header>

              {l.notesMd ? (
                <article
                  className="prose-notes"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(l.notesMd) }}
                />
              ) : (
                <p className="text-[12.5px] italic text-n-400">No typed notes.</p>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
