/**
 * Details of a web page - a blog post, an article, documentation - read from
 * the metadata the page already publishes about itself: the scholarly
 * `citation_*` tags, Open Graph, schema.org JSON-LD, then the plain <title>.
 *
 * Only the pure parsing and the address check live here; the fetch itself is
 * in lib/papers.ts alongside the Crossref and arXiv lookups.
 */

export type WebMeta = {
  title: string | null;
  /** As the page writes them - "Jane Doe" or "Doe, Jane"; the caller normalises. */
  authors: string[];
  year: number | null;
  /** Journal or conference if the page says so, else the site's name. */
  venue: string | null;
  doi: string | null;
  kind: "article" | "inproceedings" | "web";
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether it's sensible to fetch this address on the user's behalf: http(s)
 * only, and nothing on this machine or its local network.
 */
export function fetchableUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.includes(":")) return null;
  const ip = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return null;
  }
  return u;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? "";
  return out;
}

type Json = Record<string, unknown>;

/** Every object in the page's JSON-LD blocks, @graph flattened. */
function jsonLd(html: string): Json[] {
  const out: Json[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      out.push(v as Json);
      visit((v as Json)["@graph"]);
    }
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1])); } catch { /* malformed block - ignore it */ }
  }
  return out;
}

const names = (v: unknown): string[] =>
  (Array.isArray(v) ? v : v ? [v] : []).flatMap((a) => {
    const n = typeof a === "string" ? a : typeof (a as Json)?.name === "string" ? ((a as Json).name as string) : "";
    return n ? [decodeEntities(n)] : [];
  });

/** "Software engineering - Wikipedia" → "Software engineering", when the tail is just the site's name. */
function stripSite(title: string, site: string, host: string): string {
  const m = title.match(/^(.+?)\s+[-|–—·]\s+([^-|–—·]+)$/);
  if (!m) return title;
  const tail = m[2].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const known = `${site}${host}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  return tail.length >= 3 && known.includes(tail) ? m[1].trim() : title;
}

export function parseWebMeta(html: string, pageUrl: string): WebMeta {
  const head = html.slice(0, 400_000);
  const meta = new Map<string, string[]>();
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.name ?? a.property ?? a.itemprop ?? "").toLowerCase();
    if (key && a.content) meta.set(key, [...(meta.get(key) ?? []), decodeEntities(a.content)]);
  }
  const first = (...keys: string[]) => keys.map((k) => meta.get(k)?.[0]).find(Boolean) ?? null;
  const all = (...keys: string[]) => keys.map((k) => meta.get(k) ?? []).find((l) => l.length > 0) ?? [];

  const ld = jsonLd(head).find((o) => o.headline || o.datePublished || o.author) ?? {};
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  const title =
    first("citation_title", "dc.title", "og:title", "twitter:title") ??
    (typeof ld.headline === "string" ? decodeEntities(ld.headline) : null) ??
    (titleTag ? decodeEntities(titleTag) : null);

  // article:author is usually a profile URL, which is no use as a name.
  const authors = [
    all("citation_author", "dc.creator", "dc.contributor"),
    names(ld.author),
    all("author", "article:author", "twitter:creator").filter((n) => !/^https?:\/\//i.test(n)),
  ].find((l) => l.length > 0) ?? [];

  const date = first("citation_publication_date", "citation_date", "citation_online_date", "article:published_time", "datePublished", "dc.date", "dc.date.issued")
    ?? (typeof ld.datePublished === "string" ? ld.datePublished : null);
  const year = date?.match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1];

  const journal = first("citation_journal_title");
  const conference = first("citation_conference_title", "citation_conference");
  const publisher = ld.publisher && typeof ld.publisher === "object" ? names(ld.publisher)[0] : null;
  const host = new URL(pageUrl).hostname.replace(/^www\./, "");

  const site = first("og:site_name") ?? host;
  return {
    title: title ? stripSite(title, site, host).slice(0, 300) : null,
    authors: [...new Set(authors)].slice(0, 20),
    year: year ? Number(year) : null,
    venue: journal ?? conference ?? first("og:site_name", "citation_publisher") ?? publisher ?? host,
    doi: first("citation_doi")?.replace(/^(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/)/i, "") ?? null,
    kind: journal ? "article" : conference ? "inproceedings" : "web",
  };
}
