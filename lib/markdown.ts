import { Marked } from "marked";
import hljs from "highlight.js";
import DOMPurify from "isomorphic-dompurify";

/**
 * Markdown → HTML for lecture notes.
 *
 * Notes are written in the app (or pasted from Obsidian/Notion), so the
 * dialect targets what those produce: GFM tables, task lists, fenced code with
 * syntax highlighting, and footnote-free plain markdown.
 *
 * Output is sanitised even though the only author is you — paste from a web
 * page and you're pasting someone else's HTML.
 */

const marked = new Marked({
  gfm: true,
  breaks: false,
});

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
