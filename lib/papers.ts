/**
 * Research papers: turning a pasted link into details, citation keys and
 * BibTeX.
 *
 * Lookups use two free services with no account: Crossref (anything with a
 * DOI - ACM, Springer, Elsevier, most journals) and arXiv. Nothing personal
 * is sent; only the DOI or arXiv id being looked up. Any other web link - a
 * blog, an article, documentation - is fetched directly and read for the
 * details the page publishes about itself (lib/webMeta.ts).
 */

import { fetchableUrl, parseWebMeta } from "./webMeta";

export type PaperMeta = {
  title: string;
  authors: string[]; // "Surname, Given"
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  url: string | null;
  kind: "article" | "inproceedings" | "preprint" | "book" | "thesis" | "misc" | "web";
};

export const PAPER_STATUSES = ["to-read", "reading", "read"] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];
export const STATUS_LABEL: Record<PaperStatus, string> = {
  "to-read": "To read",
  reading: "Reading",
  read: "Read",
};

/* ── Recognising what was pasted ─────────────────────────────────────────── */

const DOI_RE = /\b(10\.\d{4,9}\/[^\s"<>?#]+)/i;
// New-style (2106.09685, optional version) and old-style (cs/0101001) ids.
const ARXIV_RE = /arxiv\.org\/(?:abs|pdf|html)\/([a-z-]+\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?/i;
const BARE_ARXIV_RE = /^(?:arxiv:\s*)?(\d{4}\.\d{4,5})(?:v\d+)?$/i;

export function parsePaperInput(raw: string): { doi: string | null; arxivId: string | null; url: string | null } {
  const input = raw.trim();
  const arxiv = input.match(ARXIV_RE) ?? input.match(BARE_ARXIV_RE);
  if (arxiv) {
    const id = arxiv[1];
    return { doi: null, arxivId: id, url: `https://arxiv.org/abs/${id}` };
  }
  const doi = input.match(DOI_RE);
  if (doi) {
    // Strip trailing punctuation that tends to come along when copying.
    const clean = decodeURIComponent(doi[1]).replace(/[.,;)\]]+$/, "").replace(/\/(full|pdf|abstract)$/i, "");
    return { doi: clean, arxivId: null, url: /^https?:\/\//i.test(input) ? input : `https://doi.org/${clean}` };
  }
  return { doi: null, arxivId: null, url: /^https?:\/\//i.test(input) ? input : null };
}

/* ── Fetching details ────────────────────────────────────────────────────── */

const HEADERS = { "User-Agent": "Studio study planner (personal use)" };

export async function lookupPaper(raw: string): Promise<{ ok: true; meta: PaperMeta } | { ok: false; error: string }> {
  const { doi, arxivId, url } = parsePaperInput(raw);
  try {
    if (arxivId) return { ok: true, meta: await fromArxiv(arxivId) };
    if (doi) return { ok: true, meta: await fromCrossref(doi, url) };
    if (url) {
      if (!fetchableUrl(url)) return { ok: false, error: "That address can't be fetched from here. You can fill the details in by hand." };
      return { ok: true, meta: await fromWebPage(url) };
    }
  } catch (e) {
    return { ok: false, error: `Couldn't fetch details (${e instanceof Error ? e.message : "network error"}). You can fill them in by hand.` };
  }
  return {
    ok: false,
    error: "Paste a DOI, an arXiv link or a web address, and details are filled in. Otherwise add them by hand.",
  };
}

/** A web page's own metadata. A scholarly page that names its DOI gets the full Crossref record. */
async function fromWebPage(url: string): Promise<PaperMeta> {
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`the site answered ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (type && !/html|xml/i.test(type)) throw new Error("that link isn't a web page");
  const page = parseWebMeta(await readCapped(res, 600_000), res.url || url);

  if (page.doi) {
    try { return await fromCrossref(page.doi, url); } catch { /* fall back to what the page itself says */ }
  }
  return {
    title: page.title ?? new URL(url).hostname,
    authors: page.authors.map(normaliseAuthor),
    year: page.year,
    venue: page.venue,
    doi: page.doi,
    arxivId: null,
    url,
    kind: page.kind,
  };
}

/** The start of a response body - a page's metadata is in its head, so there's no need for all of it. */
async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (text.length < max) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text;
}

const ORG_WORDS = /\b(team|staff|inc|ltd|llc|foundation|blog|labs?|news|press|university|institute|group|company|corp|editors?|research|engineering|docs|documentation)\b/i;

/**
 * "Jane Doe" → "Doe, Jane". Organisations and mononyms stay as written - a
 * company has no surname to put first.
 */
export function normaliseAuthor(name: string): string {
  const n = name.trim();
  if (n.includes(",") || ORG_WORDS.test(n)) return n;
  const words = n.split(/\s+/);
  return words.length >= 2 && words.length <= 4 ? toSurnameFirst(n) : n;
}

async function fromCrossref(doi: string, url: string | null): Promise<PaperMeta> {
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 404) throw new Error("DOI not found");
  if (!res.ok) throw new Error(`Crossref ${res.status}`);
  const m = (await res.json()).message as {
    title?: string[];
    author?: { family?: string; given?: string; name?: string }[];
    issued?: { "date-parts"?: number[][] };
    "container-title"?: string[];
    publisher?: string;
    type?: string;
  };
  const type = m.type ?? "";
  return {
    title: cleanText(m.title?.[0] ?? "Untitled"),
    authors: (m.author ?? []).map((a) => (a.family ? (a.given ? `${a.family}, ${a.given}` : a.family) : a.name ?? "")).filter(Boolean),
    year: m.issued?.["date-parts"]?.[0]?.[0] ?? null,
    venue: cleanText(m["container-title"]?.[0] ?? m.publisher ?? "") || null,
    doi,
    arxivId: null,
    url: url ?? `https://doi.org/${doi}`,
    kind:
      type === "proceedings-article" ? "inproceedings"
        : type === "journal-article" ? "article"
        : type.startsWith("book") || type === "monograph" ? "book"
        : type === "dissertation" ? "thesis"
        : type === "posted-content" ? "preprint"
        : "misc",
  };
}

async function fromArxiv(id: string): Promise<PaperMeta> {
  const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`arXiv ${res.status}`);
  const xml = await res.text();
  const entry = xml.split("<entry>")[1];
  if (!entry) throw new Error("arXiv id not found");
  const tag = (t: string) => entry.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "";
  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => toSurnameFirst(cleanText(m[1])));
  const journalRef = cleanText(entry.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/)?.[1] ?? "");
  const doi = cleanText(entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/)?.[1] ?? "") || null;
  return {
    title: cleanText(tag("title")),
    authors,
    year: Number(tag("published").slice(0, 4)) || null,
    venue: journalRef || "arXiv",
    doi,
    arxivId: id,
    url: `https://arxiv.org/abs/${id}`,
    kind: journalRef ? "article" : "preprint",
  };
}

function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, "") // Crossref titles can carry <i>, <sub>…
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Edward J. Hu" → "Hu, Edward J." */
export function toSurnameFirst(name: string): string {
  if (name.includes(",")) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  const surname = parts.pop()!;
  return `${surname}, ${parts.join(" ")}`;
}

/* ── Citation keys ───────────────────────────────────────────────────────── */

const STOP = new Set(["a", "an", "the", "on", "of", "for", "in", "to", "and", "with", "towards", "toward", "via", "is", "are"]);

/**
 * "hu2021lora" - first author's surname, year, first meaningful title word.
 * Letters and digits only, so it's valid in any LaTeX setup. Clashes with
 * `taken` get a suffix: hu2021lorab, hu2021lorac…
 */
export function makeCiteKey(meta: Pick<PaperMeta, "authors" | "year" | "title">, taken: Set<string>): string {
  const ascii = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const surname = ascii((meta.authors[0] ?? "anon").split(",")[0]) || "anon";
  const word = meta.title.split(/\s+/).map(ascii).find((w) => w && !STOP.has(w)) ?? "";
  const base = `${surname}${meta.year ?? ""}${word}`;
  if (!taken.has(base)) return base;
  for (let i = 0; i < 26; i++) {
    const k = base + String.fromCharCode(98 + i); // b, c, d…
    if (!taken.has(k)) return k;
  }
  return `${base}${Date.now()}`;
}

/* ── BibTeX ──────────────────────────────────────────────────────────────── */

export type BibPaper = {
  citeKey: string;
  title: string;
  authors: string; // "; "-joined, as stored
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxivId: string | null;
  url: string | null;
  kind: string;
  /** When it was added - a web page's "accessed" date. */
  createdAt?: Date;
};

/** Escape characters that break BibTeX/LaTeX. */
function bibEscape(s: string): string {
  return s.replace(/\\/g, "\\textbackslash{}").replace(/([&%$#_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
}

export function toBibtex(papers: BibPaper[]): string {
  return papers
    .map((p) => {
      const type =
        p.kind === "inproceedings" ? "inproceedings"
          : p.kind === "book" ? "book"
          : p.kind === "thesis" ? "phdthesis"
          : p.kind === "article" ? "article"
          : "misc";
      const venueField = type === "inproceedings" ? "booktitle" : type === "article" ? "journal" : type === "book" ? "publisher" : null;
      const fields: [string, string | null][] = [
        // Double braces keep the title's capitalisation as written.
        ["title", `{${bibEscape(p.title)}}`],
        // A name with no comma is an organisation or mononym: braces stop BibTeX splitting it into given and family.
        ["author", p.authors.split(";").map((a) => a.trim()).filter(Boolean).map((a) => (a.includes(",") ? bibEscape(a) : `{${bibEscape(a)}}`)).join(" and ") || null],
        ["year", p.year ? String(p.year) : null],
        [venueField ?? "howpublished", p.venue ? bibEscape(p.venue) : null],
        ["doi", p.doi],
        ["eprint", p.arxivId],
        ["archivePrefix", p.arxivId ? "arXiv" : null],
        ["url", p.url],
        ["urldate", p.kind === "web" && p.createdAt ? p.createdAt.toISOString().slice(0, 10) : null],
      ];
      const body = fields
        .filter(([, v]) => v)
        .map(([k, v]) => `  ${k} = {${v}}`)
        .join(",\n");
      return `@${type}{${p.citeKey},\n${body}\n}`;
    })
    .join("\n\n") + "\n";
}

/** "Hu, Shen, Wallis et al." for compact display. */
export function shortAuthors(authors: string, max = 3): string {
  const list = authors.split(";").map((a) => a.trim().split(",")[0]).filter(Boolean);
  if (list.length === 0) return "Unknown";
  return list.length > max ? `${list.slice(0, max).join(", ")} et al.` : list.join(", ");
}
