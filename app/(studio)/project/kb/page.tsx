import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { describeGitHubError } from "@/lib/github";
import { filesAtHead, getDraft, kbBlob, kbBranch, kbRepo, listChanges, readKbDoc } from "@/lib/kbData";
import { foldersOf } from "@/lib/kb";
import { splitBlocks } from "@/lib/editor/blocks";
import { renderMarkdown } from "@/lib/markdown";
import { Card, EmptyState } from "@/components/ui";
import { KbEditor } from "@/components/project/KbEditor";

export const dynamic = "force-dynamic";

/**
 * One doc in the Claude knowledge base, by its path in the repo (`?path=`):
 * what GitHub has, with the uncommitted draft over it when there is one. A
 * new doc is only a draft until its first commit.
 */
export default async function KbDocPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path } = await searchParams;
  const kb = await kbRepo();
  if (!path || !kb) redirect("/project?tab=kb" as Route);
  const { repo } = kb;

  const back = (
    <Link href={"/project?tab=kb" as Route} className="text-[12px] font-medium text-n-500 hover:text-rust-600">
      ← KB
    </Link>
  );

  const draft = await getDraft(kb, path);
  let doc: Awaited<ReturnType<typeof readKbDoc>>;
  let baseBody: string;
  let changes: Awaited<ReturnType<typeof listChanges>>;
  let branch: string;
  let folders: string[];
  try {
    doc = await readKbDoc(kb, path);
    branch = doc?.branch ?? (await kbBranch(kb));
    baseBody = draft ? (draft.base ? await kbBlob(kb, draft.base) : "") : (doc?.body ?? "");
    changes = await listChanges(kb);
    folders = foldersOf([...(await filesAtHead(kb)).keys(), ...changes.map((c) => c.path)]);
  } catch (e) {
    return (
      <div className="space-y-5">
        {back}
        <Card><EmptyState title={`Couldn't open ${path}.`} body={describeGitHubError(e)} /></Card>
      </div>
    );
  }
  if (!doc && !draft) {
    return (
      <div className="space-y-5">
        {back}
        <Card><EmptyState title={`${path} isn't in ${repo}.`} body="It may have been moved or deleted - from Studio, or in a Claude session." /></Card>
      </div>
    );
  }

  const text = draft?.body ?? doc!.body;
  const initialHtml = splitBlocks(text).map((b) => (b.text.trim() ? renderMarkdown(b.text) : ""));
  return (
    <div className="space-y-5">
      {back}
      {doc?.stale && <p className="text-[12px] text-warn">Offline - this is the last copy Studio saw. Your edits still save; committing needs GitHub.</p>}
      <KbEditor
        key={path}
        path={path}
        repo={repo}
        branch={branch}
        committed={doc ? { sha: doc.sha, body: doc.body } : null}
        base={draft ? draft.base : (doc?.sha ?? null)}
        baseBody={baseBody}
        text={text}
        initialHtml={initialHtml}
        folders={folders}
        others={changes.filter((c) => c.path !== path).map(({ path, state, added, removed }) => ({ path, state, added, removed }))}
      />
    </div>
  );
}
