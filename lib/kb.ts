/**
 * The knowledge base (KB) - markdown docs in a private GitHub repo, which
 * the Project page's KB tab browses and edits, and Claude sessions read
 * from a clone (README → "The knowledge base (KB)").
 *
 * The repo, not Studio, is the source of truth: Claude can edit the docs in
 * a session and push, and Studio shows that on the next load. Its structure
 * is Ollie's - hand-written INDEX.md files say how to read each folder - so
 * Studio never writes a file it wasn't asked to. Everything here is pure, so
 * it's tested without a network.
 */

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
  return { ok: true, path: p };
}

/** The docs Studio lists: every markdown file. */
export const isDocPath = (path: string) => /\.md$/i.test(path);

/** "notes/ideas/Plan.md" → "notes/ideas"; a doc at the top has none. */
export const folderOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/** "notes/Plan.md" → "Plan.md" - the subtitle on a card. */
export const baseNameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const fileNameOf = (path: string) => baseNameOf(path).replace(/\.md$/i, "");

/** Where a doc opens in Studio. A query string, not a catch-all route, so
 *  any character in a path arrives exactly as it was. */
export const docHref = (path: string) => `/project/kb?path=${encodeURIComponent(path)}`;

/* ── Content ─────────────────────────────────────────────────────────────── */

const H1 = /^\s{0,3}#\s+(.+?)\s*#*\s*$/m;

/** The first `# Heading`, else the file's name. */
export function titleOf(path: string, body: string): string {
  return H1.exec(body)?.[1].trim() || fileNameOf(path);
}

/** The body for a PDF, which prints the title itself: without the `# Heading`
 *  when the doc opens with one, so it isn't there twice. */
export function pdfBodyOf(body: string): string {
  return body.replace(/^\s*#[ \t]+.*(\n|$)/, "").replace(/^\s*\n/, "");
}

/** A starter body for a new doc, headed with its name. */
export const starterBody = (path: string) => `# ${fileNameOf(path)}\n\n`;

/** The first lines after the title, as plain text - the card excerpt. */
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

/** One file a commit writes or removes. */
export type KbChange = { path: string; content: string } | { path: string; delete: true };
