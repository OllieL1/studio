import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";
import { fmtDateLong } from "@/lib/dates";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/** Print-optimised view of one lecture's notes. */
export default async function LecturePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { id } = await params;
  // ?auto=1 comes from the editor's PDF button: open the print dialog straight away.
  const { auto } = await searchParams;
  const lecture = await db.task.findUnique({
    where: { id },
    include: { course: true },
  });
  if (!lecture) notFound();

  return (
    <div className="print-sheet mx-auto max-w-[760px]">
      <div className="no-print mb-6 flex items-center justify-between gap-4 rounded-lg border border-n-100 bg-n-0 p-3">
        <Link href={`/lectures/${lecture.id}`} className="text-[12.5px] font-medium text-n-500 hover:text-rust-600">
          ← Back to lecture
        </Link>
        <PrintButton auto={auto === "1"} />
      </div>

      <header className="mb-8 border-b border-n-200 pb-5">
        {lecture.course && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n-500">
            {lecture.course.name} · {lecture.course.code}
          </p>
        )}
        <h1 className="font-display mt-2 text-[32px] leading-10 font-semibold tracking-tight text-n-900">
          {lecture.title}
        </h1>
        <p className="mt-1.5 text-[12.5px] text-n-500">
          {lecture.dueAt ? fmtDateLong(lecture.dueAt) : "Unscheduled"}
          {lecture.notebook && (
            <>
              {" · Handwritten: "}
              {lecture.notebook}
              {lecture.notebookPages ? ` pp. ${lecture.notebookPages}` : ""}
            </>
          )}
        </p>
      </header>

      {lecture.notesMd ? (
        <article
          className="prose-notes"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(lecture.notesMd) }}
        />
      ) : (
        <p className="text-[13px] text-n-400">No typed notes for this lecture yet.</p>
      )}
    </div>
  );
}
