import type { Route } from "next";
import Link from "next/link";
import { describeGitHubError } from "@/lib/github";
import { kbHasToken, kbRepo, listChanges, listKbWithFiles, type KbChangeSummary, type KbListing } from "@/lib/kbData";
import { baseNameOf, folderOf, summaryOf, titleOf, wordCount } from "@/lib/kb";
import { fmtAgo } from "@/lib/dates";
import { Card, EmptyState } from "@/components/ui";
import { ClaudeKb, KbRepoForm } from "./ClaudeKb";

/**
 * The Claude knowledge base: the markdown docs Claude reads at the start of a
 * session, kept in their own private repo and edited here (lib/kb.ts).
 *
 * Streams behind its own Suspense boundary like the GitHub tab - the first
 * visit fetches every doc once; after that it's one request for the branch
 * head, and the rest comes from the cache by sha.
 */
export async function ClaudeTab() {
  const kbConfig = await kbRepo();
  if (!kbConfig) {
    return (
      <Card className="p-5">
        <EmptyState
          title="No knowledge base yet."
          body="Point this at a private GitHub repo of markdown docs - the context you want every Claude session to start with. Studio edits them here and commits each save; Claude reads them from a clone."
        />
        <div className="mx-auto mt-2 max-w-[460px]"><KbRepoForm current={null} hasToken={false} /></div>
      </Card>
    );
  }
  const repo = kbConfig.repo;
  if (!(await kbHasToken(kbConfig))) {
    return (
      <Card className="p-5">
        <EmptyState
          title="Add a token to open the knowledge base."
          body={`${repo} is private, so Studio needs a token to read and commit to it - one for this repo below, or the main one in Settings.`}
          action={
            <Link href={"/settings#github" as Route} className="text-[12.5px] font-semibold text-n-600 hover:text-rust-600">
              GitHub settings →
            </Link>
          }
        />
        <div className="mx-auto mt-2 max-w-[460px]"><KbRepoForm current={repo} hasToken={false} /></div>
      </Card>
    );
  }

  let kb: KbListing;
  let changes: KbChangeSummary[];
  try {
    const listing = await listKbWithFiles(kbConfig);
    kb = listing;
    changes = await listChanges(kbConfig, listing.files);
  } catch (e) {
    return (
      <Card className="p-5">
        <EmptyState title={`Couldn't open ${repo}.`} body={describeGitHubError(e)} />
        <div className="mx-auto mt-2 max-w-[460px]"><KbRepoForm current={repo} hasToken={!!kbConfig.token} /></div>
      </Card>
    );
  }

  const byPath = new Map(changes.map((c) => [c.path, c]));
  const card = (path: string, body: string) => {
    const folder = folderOf(path);
    const c = byPath.get(path);
    return {
      id: path,
      title: titleOf(path, body),
      pinned: false,
      updatedAt: null,
      tags: folder ? [folder] : [],
      excerpt: summaryOf(body),
      words: wordCount(body),
      file: baseNameOf(path),
      change: c ? { state: c.state, added: c.added, removed: c.removed } : undefined,
    };
  };
  const onGitHub = new Set(kb.docs.map((d) => d.path));

  return (
    <ClaudeKb
      repo={kb.repo}
      changes={changes}
      hasToken={!!kbConfig.token}
      branch={kb.branch}
      stale={kb.stale ? fmtAgo(kb.fetchedAt) : null}
      docs={[
        // A draft shows what you'll commit; a new doc is only a draft so far.
        ...kb.docs.map((d) => card(d.path, byPath.get(d.path)?.after ?? d.body)),
        ...changes.filter((c) => !onGitHub.has(c.path)).map((c) => card(c.path, c.after)),
      ]}
    />
  );
}
