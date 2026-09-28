import { Marked } from "marked";
import hljs from "highlight.js";
import DOMPurify from "isomorphic-dompurify";
import katex from "katex";
import { mentionHref, linkDomain, type MentionKind } from "./mentions";

/**
 * Markdown → HTML for lecture notes.
 *
 * Notes are written in the app (or pasted from Obsidian/Notion), so the
 * dialect targets what those produce: GFM tables, task lists, fenced code with
 * syntax highlighting, and footnote-free plain markdown.
 *
 * Output is sanitised even though the only author is you — paste from a web
 * page and you're pasting someone else's HTML.
 *
 * Maths is LaTeX between dollars, rendered by KaTeX to MathML. MathML alone
 * (rather than KaTeX's HTML) means no stylesheet and no web fonts to ship,
 * which matters for an app that runs offline from a USB stick; browsers draw
 * it natively.
 */

const marked = new Marked({
  gfm: true,
  breaks: false,
});

/** `$$…$$` on its own lines, and `$…$` inline. */
const mathBlock = {
  name: "mathBlock",
  level: "block" as const,
  start(src: string) {
    return src.indexOf("$$");
  },
  tokenizer(src: string) {
    const m = /^\$\$\n?([\s\S]+?)\n?\$\$(?:\n|$)/.exec(src);
    if (!m) return undefined;
    return { type: "mathBlock", raw: m[0], text: m[1].trim() };
  },
  renderer(token: { text: string }) {
    return `<div class="md-math">${renderMath(token.text, true)}</div>`;
  },
};

const mathInline = {
  name: "mathInline",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("$");
  },
  tokenizer(src: string) {
    // A single dollar either side, with no space just inside, so "$5 and $6"
    // isn't mistaken for maths.
    const m = /^\$(?!\s)((?:[^$\n]|\\\$)+?)(?<!\s)\$(?!\d)/.exec(src);
    if (!m) return undefined;
    return { type: "mathInline", raw: m[0], text: m[1] };
  },
  renderer(token: { text: string }) {
    return renderMath(token.text, false);
  },
};

/** Bad LaTeX shows as its source rather than breaking the note. */
function renderMath(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, { output: "mathml", displayMode: display, throwOnError: true });
  } catch {
    return `<code class="md-math-error" title="That LaTeX didn't parse">${escapeHtml(display ? `$$${tex}$$` : `$${tex}$`)}</code>`;
  }
}

/** `::: columns` … `|||` … `:::` - two markdown columns, side by side. */
const columns = {
  name: "columns",
  level: "block" as const,
  start(src: string) {
    return src.indexOf(":::");
  },
  tokenizer(src: string) {
    const m = /^:::\s*columns\s*\n([\s\S]*?)(?:\n:::|$)(?:\n|$)/.exec(src);
    if (!m) return undefined;
    const at = m[1].split("\n").findIndex((l) => l.trim() === "|||");
    const lines = m[1].split("\n");
    const left = (at === -1 ? lines : lines.slice(0, at)).join("\n").trim();
    const right = at === -1 ? "" : lines.slice(at + 1).join("\n").trim();
    return { type: "columns", raw: m[0], left, right };
  },
  renderer(token: { left: string; right: string }) {
    const cell = (md: string) => marked.parse(md, { async: false }) as string;
    return `<div class="md-columns"><div>${cell(token.left)}</div><div>${cell(token.right)}</div></div>`;
  },
};

/**
 * `> [!note] Title` - a highlighted box rather than a quote. The syntax is
 * Obsidian's, so a note pasted into Obsidian still reads as a callout there.
 */
const callout = {
  name: "callout",
  level: "block" as const,
  start(src: string) {
    return src.indexOf("> [!");
  },
  tokenizer(src: string) {
    const m = /^>\s*\[!(\w+)\][ \t]*(.*)(?:\n((?:>.*(?:\n|$))*))?/.exec(src);
    if (!m) return undefined;
    const body = (m[3] ?? "")
      .split("\n")
      .map((l) => l.replace(/^>\s?/, ""))
      .join("\n")
      .trim();
    return { type: "callout", raw: m[0], title: m[2].trim(), body };
  },
  renderer(token: { title: string; body: string }) {
    const title = token.title
      ? `<p class="md-callout-title">${escapeHtml(token.title)}</p>`
      : "";
    const body = token.body ? (marked.parse(token.body, { async: false }) as string) : "";
    return `<div class="md-callout">${title}${body}</div>`;
  },
};

/**
 * `@r[key|Label]` and friends - a chip that links to the thing it names.
 * The label travels inside the token, so this stays a pure render.
 */
const KIND_OF: Record<string, MentionKind> = {
  r: "paper", "#": "tag", t: "task", n: "note", m: "meeting", u: "link",
};

const mention = {
  name: "mention",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("@");
  },
  tokenizer(src: string) {
    const m = /^@([r#tnmu])\[([^\]|]+)(?:\|([^\]]*))?\]/.exec(src);
    if (!m) return undefined;
    return { type: "mention", raw: m[0], sigil: m[1], id: m[2].trim(), label: (m[3] ?? m[2]).trim() };
  },
  renderer(token: { sigil: string; id: string; label: string }) {
    const kind = KIND_OF[token.sigil];
    const href = mentionHref(kind, token.id);
    const external = kind === "link";
    const prefix =
      kind === "tag" ? "#" : kind === "link" ? `${escapeHtml(linkDomain(token.id))} · ` : "";
    const text = kind === "tag" ? escapeHtml(token.id) : escapeHtml(token.label);
    return (
      `<a class="md-chip md-chip-${kind}" href="${escapeHtml(href)}"` +
      (external ? ' target="_blank" rel="noreferrer"' : "") +
      `>${prefix ? `<span class="md-chip-prefix">${prefix}</span>` : ""}${text}</a>`
    );
  },
};

marked.use({ extensions: [mathBlock, mathInline, columns, callout, mention] });

// Syntax highlighting + heading ids/anchors for the table of contents.
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : null;
      const highlighted = language
        ? hljs.highlight(text, { language }).value
        : escapeHtml(text);
      const label = language ? `<span class="code-lang">${language}</span>` : "";
      return `<pre class="code-block">${label}<code class="hljs">${highlighted}</code></pre>`;
    },
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const id = slugify(stripTags(text));
      return `<h${depth} id="${id}" class="md-h md-h${depth}">${text}</h${depth}>`;
    },
  },
});

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ["id", "class", "target", "rel"],
  });
}

export type TocEntry = { id: string; text: string; depth: number };

/** Headings, for the in-page outline and the printed table of contents. */
export function extractToc(md: string, maxDepth = 3): TocEntry[] {
  const out: TocEntry[] = [];
  let inFence = false;

  for (const line of md.split("\n")) {
    // Don't mistake a `# comment` inside a code fence for a heading.
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const depth = m[1].length;
    if (depth > maxDepth) continue;
    const text = stripTags(m[2]).trim();
    if (text) out.push({ id: slugify(text), text, depth });
  }
  return out;
}

/** A rough word count, for "≈ 8 min read" style hints. */
export function wordCount(md: string): number {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`~\-|]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "section";
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
