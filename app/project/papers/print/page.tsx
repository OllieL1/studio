import { db } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";
import { STATUS_LABEL, type PaperStatus } from "@/lib/papers";
import { fmtDateLongYear } from "@/lib/dates";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/** Selected papers with their notes, as a document to save as PDF. */
export default async function PapersPrint({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const list = (ids ?? "").split(",").filter(Boolean);
  const papers = await db.paper.findMany({
    where: list.length ? { id: { in: list } } : undefined,
    orderBy: [{ year: "desc" }, { title: "asc" }],
  });

  return (
    <div className="print-sheet mx-auto max-w-[760px]">
      <div className="no-print mb-6 flex items-center justify-between gap-3 rounded-lg border border-n-100 bg-n-0 p-3">
        <span className="text-[12.5px] text-n-500">{papers.length} paper{papers.length === 1 ? "" : "s"}</span>
        <PrintButton auto />
      </div>

      <header className="mb-8 border-b-2 border-n-800 pb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-n-500">Project · Research</p>
        <h1 className="font-display mt-2 text-[34px] leading-10 font-semibold text-n-900">Reading notes</h1>
        <p className="mt-1.5 text-[12.5px] text-n-500">{papers.length} paper{papers.length === 1 ? "" : "s"} · compiled {fmtDateLongYear(new Date())}</p>
      </header>

      {papers.map((p, i) => (
        <section key={p.id} className={i === 0 ? "mb-8" : "mb-8 border-t border-n-200 pt-6"} style={{ breakInside: "avoid-page" }}>
          <p className="font-num text-[11px] text-n-400">[{i + 1}] {p.citeKey}</p>
          <h2 className="font-display mt-1 text-[21px] leading-7 font-semibold text-n-900">{p.title}</h2>
          <p className="mt-1 text-[13px] text-n-600">
            {p.authors.split(";").map((a) => a.trim()).filter(Boolean).join(", ")}
            {p.year && ` (${p.year})`}
          </p>
          <p className="mt-0.5 text-[12px] text-n-500">
            {p.venue && <em>{p.venue}. </em>}
            {p.doi ? `doi:${p.doi}` : p.url}
            <span className="ml-2 font-semibold">· {STATUS_LABEL[p.status as PaperStatus] ?? p.status}</span>
            {p.tags && <span className="ml-2 text-n-400">{p.tags.split(",").map((t) => `#${t.trim()}`).join(" ")}</span>}
          </p>
          {p.notes ? (
            <article className="prose-notes mt-3 text-[13.5px]" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.notes) }} />
          ) : (
            <p className="mt-3 text-[12.5px] italic text-n-400">No notes.</p>
          )}
        </section>
      ))}
    </div>
  );
}
