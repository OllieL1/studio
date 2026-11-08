/**
 * The Claude knowledge base - markdown docs in a private GitHub repo, which
 * the Project page's Claude tab browses and edits, and Claude sessions read
 * from a clone (README → "The Claude knowledge base").
 *
 * The repo, not Studio, is the source of truth: Claude can edit the docs in
 * a session and push, and Studio shows that on the next load. Everything here
 * is pure - paths, titles, the index - so it's tested without a network.
 */

/** Rewritten on every save; never listed or edited in Studio. */
export const INDEX_PATH = "INDEX.md";

export type KbDoc = {
  path: string;
  /** The git blob sha - what a save checks hasn't moved underneath it. */
  sha: string;
  body: string;
};

/* ── Paths ───────────────────────────────────────────────────────────────── */

/** Characters a Windows checkout can't hold, plus control characters. */
const BAD_CHARS = /[\\:*?"<>|\u0000-\u001f]/;

/**
 * A typed path as a doc path - `notes/Plan` becomes `notes/Plan.md` - or an
 * error that says what's wrong with it. Folders are just the slashes.
 */
export function normalizeDocPath(input: string): { ok: true; path: string } | { ok: false; error: string } {
  let p = input.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "");
  if (!p) return { ok: false, error: "Give the doc a name." };
  if (!/\.md$/i.test(p)) p = `${p}.md`;
  const segments = p.split("/").map((s) => s.trim());
  if (segments.some((s) => s === "" || s === "." || s === "..")) return { ok: false, error: "That path has an empty or relative part in it." };
  if (segments.some((s) => s.startsWith("."))) return { ok: false, error: "Names can't start with a dot - git and Claude would treat them as hidden." };
  if (BAD_CHARS.test(p)) return { ok: false, error: 'Names can\'t contain \\ : * ? " < > or |.' };
  p = segments.join("/");
  if (p.toLowerCase() === INDEX_PATH.toLowerCase()) return { ok: false, error: `${INDEX_PATH} is written by Studio - pick another name.` };
  return { ok: true, path: p };
}

/** The docs Studio lists: markdown, except the generated index. */
export const isDocPath = (path: string) => /\.md$/i.test(path) && path.toLowerCase() !== INDEX_PATH.toLowerCase();

/** "notes/ideas/Plan.md" → "notes/ideas"; a doc at the top has none. */
export const folderOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

const fileNameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");

/** Where a doc opens in Studio. A query string, not a catch-all route, so
 *  any character in a path arrives exactly as it was. */
export const docHref = (path: string) => `/project/claude?path=${encodeURIComponent(path)}`;

/* ── Content ─────────────────────────────────────────────────────────────── */

const H1 = /^\s{0,3}#\s+(.+?)\s*#*\s*$/m;

/** The first `# Heading`, else the file's name. */
export function titleOf(path: string, body: string): string {
  return H1.exec(body)?.[1].trim() || fileNameOf(path);
}

/** A starter body for a new doc, headed with its name. */
export const starterBody = (path: string) => `# ${fileNameOf(path)}\n\n`;

/** The first lines after the title, as plain text - the card excerpt and the index line. */
export function summaryOf(body: string, length = 140): string {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(H1, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>|]/g, "")
    .replace(/^\s*[-+]\s+(\[[ xX]\]\s+)?/gm, "· ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export const wordCount = (body: string) => body.split(/\s+/).filter(Boolean).length;

/* ── The index ───────────────────────────────────────────────────────────── */

/**
 * INDEX.md: one line per doc, grouped by folder. A Claude session starts by
 * reading this rather than every doc, and opens the ones it needs - so the
 * knowledge base can grow without filling the context.
 */
export function buildIndex(docs: { path: string; body: string }[]): string {
  const groups = new Map<string, { path: string; body: string }[]>();
  for (const d of [...docs].filter((d) => isDocPath(d.path)).sort((a, b) => a.path.localeCompare(b.path))) {
    const f = folderOf(d.path);
    groups.set(f, [...(groups.get(f) ?? []), d]);
  }
  const line = (d: { path: string; body: string }) => {
    const summary = summaryOf(d.body, 120);
    const href = d.path.split("/").map(encodeURIComponent).join("/");
    return `- [${titleOf(d.path, d.body)}](${href})${summary ? ` - ${summary}` : ""}`;
  };
  const out = [
    "# Index",
    "",
    "Every doc in this knowledge base, one line each. Read this first, then open the docs that matter for the task.",
    "",
    "<!-- Written by Studio on every save. Edit the docs, not this file - changes here are overwritten. -->",
  ];
  const folders = [...groups.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  for (const f of folders) {
    out.push("");
    if (f) out.push(`## ${f}/`, "");
    out.push(...groups.get(f)!.map(line));
  }
  if (folders.length === 0) out.push("", "_No docs yet._");
  return `${out.join("\n")}\n`;
}

/* ── Changes ─────────────────────────────────────────────────────────────── */

export type KbChange = { path: string; content: string } | { path: string; delete: true };

/** The docs as they'll be once `changes` land - what the new index is built from. */
export function applyChanges(docs: { path: string; body: string }[], changes: KbChange[]): { path: string; body: string }[] {
  const byPath = new Map(docs.map((d) => [d.path, d.body]));
  for (const c of changes) {
    if ("delete" in c) byPath.delete(c.path);
    else byPath.set(c.path, c.content);
  }
  return [...byPath].map(([path, body]) => ({ path, body }));
}
