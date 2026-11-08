import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { describeGitHubError } from "@/lib/github";
import { kbRepo, readKbDoc } from "@/lib/kbData";
import { splitBlocks } from "@/lib/editor/blocks";
import { renderMarkdown } from "@/lib/markdown";
import { Card, EmptyState } from "@/components/ui";
import { KbEditor } from "@/components/project/KbEditor";

export const dynamic = "force-dynamic";

/** One doc in the Claude knowledge base, by its path in the repo (`?path=`). */
export default async function KbDocPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path } = await searchParams;
  const kb = await kbRepo();
  if (!path || !kb) redirect("/project?tab=claude" as Route);
  const { repo } = kb;

  const back = (
    <Link href={"/project?tab=claude" as Route} className="text-[12px] font-medium text-n-500 hover:text-rust-600">
      ← Claude
    </Link>
  );

  let doc: Awaited<ReturnType<typeof readKbDoc>>;
  try {
    doc = await readKbDoc(kb, path);
  } catch (e) {
    return (
      <div className="space-y-5">
        {back}
        <Card><EmptyState title={`Couldn't open ${path}.`} body={describeGitHubError(e)} /></Card>
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="space-y-5">
        {back}
        <Card><EmptyState title={`${path} isn't in ${repo}.`} body="It may have been moved or deleted - from Studio, or in a Claude session." /></Card>
      </div>
    );
  }

  const initialHtml = splitBlocks(doc.body).map((b) => (b.text.trim() ? renderMarkdown(b.text) : ""));
  return (
    <div className="space-y-5">
      {back}
      {doc.stale && <p className="text-[12px] text-warn">Offline - this is the last copy Studio saw. Saving needs GitHub.</p>}
      <KbEditor key={doc.path} doc={{ path: doc.path, sha: doc.sha, body: doc.body }} initialHtml={initialHtml} repo={repo} branch={doc.branch} />
    </div>
  );
}
