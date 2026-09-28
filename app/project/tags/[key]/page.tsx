import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTagPage } from "@/lib/nexusData";
import { shortAuthors } from "@/lib/papers";
import { fmtRelative } from "@/lib/dates";
import { Card, Eyebrow, EmptyState } from "@/components/ui";
import { TagHeader } from "@/components/project/TagHeader";

export const dynamic = "force-dynamic";

/** Everything filed under one tag: papers, notes, and notes that mention it. */
export default async function TagPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const data = await getTagPage(decodeURIComponent(key));
  if (!data) notFound();

  const { tag, papers, notes, mentions } = data;
  const total = papers.length + notes.length + mentions.length;

  return (
    <div className="space-y-5">
      <div>
        <Link href={"/project?tab=nexus" as Route} className="text-[12px] font-medium text-n-500 hover:text-rust-600">
          ← Nexus
        </Link>
        <TagHeader id={tag.id} name={tag.name} count={total} />
      </div>

      {total === 0 && (
        <Card>
          <EmptyState title="Nothing filed here yet." body="Tag a paper or a note with it, or mention it in a note with @#." />
        </Card>
      )}

      {papers.length > 0 && (
        <section>
          <h2 className="font-display mb-2 text-[19px] font-semibold text-n-800">
            Research <span className="font-num text-[13px] font-normal text-n-400">{papers.length}</span>
          </h2>
          <Card>
            {papers.map((p) => (
              <Link
                key={p.id}
                href={`/project?tab=research&paper=${encodeURIComponent(p.citeKey)}` as Route}
                className="block border-b border-n-100 px-4 py-3 last:border-b-0 hover:bg-n-25"
              >
                <p className="text-[13.5px] font-medium text-n-800">{p.title}</p>
                <p className="mt-0.5 text-[11.5px] text-n-500">
                  {[shortAuthors(p.authors, 4), p.year, p.citeKey].filter(Boolean).join(" · ")}
                </p>
              </Link>
            ))}
          </Card>
        </section>
      )}

      {[
        { title: "Notes", items: notes, hint: "tagged" },
        { title: "Mentioned in", items: mentions, hint: "written into the text" },
      ].map(({ title, items, hint }) =>
        items.length === 0 ? null : (
          <section key={title}>
            <h2 className="font-display mb-2 text-[19px] font-semibold text-n-800">
              {title} <span className="font-num text-[13px] font-normal text-n-400">{items.length}</span>
              <span className="ml-2 text-[11.5px] font-normal text-n-400">{hint}</span>
            </h2>
            <Card>
              {items.map((n) => (
                <Link
                  key={n.id}
                  href={`/project/nexus/${n.id}` as Route}
                  className="block border-b border-n-100 px-4 py-3 last:border-b-0 hover:bg-n-25"
                >
                  <p className="flex items-baseline gap-2 text-[13.5px] font-medium text-n-800">
                    {n.title}
                    <span className="font-num ml-auto text-[10.5px] text-n-400">{fmtRelative(n.updatedAt)}</span>
                  </p>
                  {n.excerpt && <p className="mt-0.5 truncate text-[11.5px] text-n-500">{n.excerpt}</p>}
                </Link>
              ))}
            </Card>
          </section>
        ),
      )}

      <Eyebrow className="text-n-400">Renaming this tag updates every paper, note and mention.</Eyebrow>
    </div>
  );
}
