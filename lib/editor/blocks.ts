/**
 * The block model behind the live editor.
 *
 * A note is one markdown string, but it's edited as a list of blocks: the
 * block the caret is in shows its raw markdown, every other block shows as
 * rendered HTML. Splitting has to be lossless - `join(split(md)) === md` for
 * anything normal - or editing one paragraph would quietly rewrite the rest
 * of the note.
 */

export type BlockKind =
  | "paragraph" | "heading" | "list" | "quote" | "code"
  | "table" | "rule" | "math" | "callout" | "columns";

export type Block = {
  id: string;
  text: string;
  kind: BlockKind;
};

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^\s{0,3}#{1,6}\s/;
const LIST = /^\s*([-*+]|\d+[.)])\s/;
const QUOTE = /^\s*>/;
const RULE = /^\s*([-*_])\s*(\1\s*){2,}$/;
const TABLE_ROW = /\|/;
const TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*\|/;
const MATH = /^\s*\$\$/;
/** `::: columns` … `:::`, with `|||` between the two sides. */
const CONTAINER = /^\s*:::\s*(\w+)?/;
export const COLUMN_SPLIT = "|||";
/** Obsidian-style callout: `> [!note]`, optionally with a title after it. */
const CALLOUT = /^\s*>\s*\[!(\w+)\]\s*(.*)$/;

let counter = 0;
/** Ids are per-session and never persisted; React just needs them stable. */
export const newId = () => `b${++counter}`;

export function classify(text: string): BlockKind {
  const first = text.split("\n")[0] ?? "";
  if (CONTAINER.test(first)) return "columns";
  if (CALLOUT.test(first)) return "callout";
  if (FENCE.test(first)) return "code";
  if (MATH.test(first)) return "math";
  if (RULE.test(first)) return "rule";
  if (HEADING.test(first)) return "heading";
  if (QUOTE.test(first)) return "quote";
  if (LIST.test(first)) return "list";
  if (TABLE_ROW.test(first) && TABLE_SEP.test(text.split("\n")[1] ?? "")) return "table";
  return "paragraph";
}

const block = (text: string): Block => ({ id: newId(), text, kind: classify(text) });

/**
 * Split markdown into editable blocks.
 *
 * Blank lines separate blocks, except inside a fenced code block, where they
 * belong to the code. Lists and quotes keep their whole run together so they
 * render as one list rather than a stack of one-item lists.
 */
export function splitBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].trim()) {
      i++;
      continue;
    }

    // A container (`::: columns`) runs to its closing `:::`.
    if (CONTAINER.test(lines[i])) {
      const buf = [lines[i++]];
      while (i < lines.length) {
        buf.push(lines[i]);
        const closed = lines[i].trim() === ":::";
        i++;
        if (closed) break;
      }
      out.push(block(buf.join("\n")));
      continue;
    }

    // Display maths: everything up to and including the closing $$.
    if (MATH.test(lines[i])) {
      const buf = [lines[i++]];
      // "$$x$$" on one line is already closed.
      if (!/\$\$[\s\S]*\$\$\s*$/.test(buf[0])) {
        while (i < lines.length) {
          buf.push(lines[i]);
          const closed = lines[i].trim().endsWith("$$");
          i++;
          if (closed) break;
        }
      }
      out.push(block(buf.join("\n")));
      continue;
    }

    // Fenced code: everything up to and including the closing fence.
    if (FENCE.test(lines[i])) {
      const marker = FENCE.exec(lines[i])![1];
      const buf = [lines[i++]];
      while (i < lines.length) {
        buf.push(lines[i]);
        if (lines[i].trim().startsWith(marker)) {
          i++;
          break;
        }
        i++;
      }
      out.push(block(buf.join("\n")));
      continue;
    }

    const kind = classify(lines[i]);

    if (kind === "heading" || kind === "rule") {
      out.push(block(lines[i++]));
      continue;
    }

    // A run of like lines: list items, quote lines, table rows, or the lines
    // of one paragraph.
    const buf: string[] = [];
    const sameRun = (line: string) => {
      if (!line.trim()) return false;
      if (FENCE.test(line) || HEADING.test(line) || RULE.test(line) || MATH.test(line) || CONTAINER.test(line)) return false;
      if (CALLOUT.test(line)) return false; // a second callout starts its own block
      if (kind === "list") return LIST.test(line) || /^\s+\S/.test(line);
      if (kind === "quote" || kind === "callout") return QUOTE.test(line);
      if (kind === "table") return TABLE_ROW.test(line);
      // A paragraph stops when the next line starts something else.
      return !LIST.test(line) && !QUOTE.test(line);
    };

    buf.push(lines[i++]);
    while (i < lines.length && sameRun(lines[i])) buf.push(lines[i++]);
    out.push(block(buf.join("\n")));
  }

  return out.length > 0 ? out : [block("")];
}

/** Back to one markdown string. */
export function joinBlocks(blocks: { text: string }[]): string {
  return blocks
    .map((b) => b.text.replace(/\s+$/, ""))
    .filter((t, i, all) => t !== "" || i === all.length - 1)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Re-derive a block's kind after an edit, keeping its id. */
export function retype(b: Block): Block {
  const kind = classify(b.text);
  return kind === b.kind ? b : { ...b, kind };
}

/* ── Typing helpers ──────────────────────────────────────────────────────── */

/**
 * What Enter should do inside a list: continue it, or end it.
 *
 * Pressing Enter on an empty item is how every editor lets you leave a list,
 * so that returns `exit` and the caller turns the block into a paragraph.
 */
export function listContinuation(text: string, caret: number): { insert: string } | { exit: true; text: string } | null {
  const before = text.slice(0, caret);
  const line = before.slice(before.lastIndexOf("\n") + 1);
  const m = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/.exec(line);
  if (!m) return null;

  const [, indent, marker, space, task, rest] = m;
  if (!rest.trim() && !task?.trim()) {
    // Empty item: drop the marker and leave the list.
    return { exit: true, text: text.slice(0, caret - line.length) + text.slice(caret) };
  }

  const next = /^\d/.test(marker) ? `${parseInt(marker, 10) + 1}${marker.slice(-1)}` : marker;
  return { insert: `\n${indent}${next}${space}${task ? "[ ] " : ""}` };
}

const INDENT = "  ";

/**
 * Tab and Shift-Tab over the selected lines.
 *
 * Indenting by hand with spaces is the single most annoying thing about
 * writing nested bullets, so Tab shifts whole lines rather than inserting a
 * character. Outdent removes up to one indent's worth of leading space.
 */
export function indentLines(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  outdent = false,
): { text: string; start: number; end: number } {
  const from = text.lastIndexOf("\n", selectionStart - 1) + 1;
  const toEnd = text.indexOf("\n", selectionEnd);
  const to = toEnd === -1 ? text.length : toEnd;

  const before = text.slice(0, from);
  const after = text.slice(to);
  const lines = text.slice(from, to).split("\n");

  let firstDelta = 0;
  let total = 0;
  const shifted = lines.map((line, i) => {
    if (outdent) {
      const lead = /^[ \t]{1,2}/.exec(line)?.[0] ?? "";
      if (i === 0) firstDelta = -lead.length;
      total -= lead.length;
      return line.slice(lead.length);
    }
    if (i === 0) firstDelta = INDENT.length;
    total += INDENT.length;
    return INDENT + line;
  });

  return {
    text: before + shifted.join("\n") + after,
    start: Math.max(from, selectionStart + firstDelta),
    end: Math.max(from, selectionEnd + total),
  };
}

/** Which line of a textarea the caret sits on, and how many there are. */
export function caretLine(text: string, caret: number): { line: number; lines: number; column: number } {
  const before = text.slice(0, caret);
  const line = before.split("\n").length - 1;
  return { line, lines: text.split("\n").length, column: caret - (before.lastIndexOf("\n") + 1) };
}

/**
 * Roughly where a click in the rendered block lands in the markdown.
 *
 * The rendered text has no syntax characters in it, so this walks the source
 * counting only what's visible and stops when it has passed enough of it.
 * It's an estimate - good enough to put the caret near what you clicked.
 */
export function sourceOffset(md: string, visibleTarget: number): number {
  if (visibleTarget <= 0) return 0;
  let visible = 0;
  let i = 0;

  const atLineStart = () => i === 0 || md[i - 1] === "\n";

  while (i < md.length) {
    if (atLineStart()) {
      const rest = md.slice(i);
      const skip = /^(\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?))/.exec(rest);
      if (skip) {
        i += skip[1].length;
        continue;
      }
    }
    const ch = md[i];
    if (ch === "`") {
      i++;
      continue;
    }
    if ((ch === "*" || ch === "_") && md[i + 1] === ch) {
      i += 2;
      continue;
    }
    if (ch === "*" || ch === "_") {
      i++;
      continue;
    }
    // [text](url) - the label is visible, the target isn't.
    if (ch === "[") {
      const close = md.indexOf("]", i);
      const open = close >= 0 ? md.indexOf("(", close) : -1;
      if (close > 0 && open === close + 1) {
        const end = md.indexOf(")", open);
        const label = md.slice(i + 1, close);
        if (visible + label.length >= visibleTarget) return i + 1 + (visibleTarget - visible);
        visible += label.length;
        i = end === -1 ? close + 1 : end + 1;
        continue;
      }
    }
    visible++;
    i++;
    if (visible >= visibleTarget) return i;
  }
  return md.length;
}

/* ── Columns and callouts ────────────────────────────────────────────────── */

/** The two sides of a `::: columns` block, as markdown. */
export function parseColumns(text: string): [string, string] {
  const lines = text.split("\n");
  const open = lines.findIndex((l) => CONTAINER.test(l));
  const body = lines.slice(open + 1);
  // Drop the closing fence if it's there.
  if (body.length && body[body.length - 1].trim() === ":::") body.pop();

  const at = body.findIndex((l) => l.trim() === COLUMN_SPLIT);
  if (at === -1) return [body.join("\n").trim(), ""];
  return [body.slice(0, at).join("\n").trim(), body.slice(at + 1).join("\n").trim()];
}

export function serializeColumns(left: string, right: string): string {
  return [`::: columns`, left.trim(), COLUMN_SPLIT, right.trim(), ":::"].join("\n");
}

/** A callout's title (may be empty) and its body, as markdown. */
export function parseCallout(text: string): { title: string; body: string } {
  const lines = text.split("\n");
  const head = CALLOUT.exec(lines[0]);
  const title = head?.[2]?.trim() ?? "";
  const body = lines
    .slice(1)
    .map((l) => l.replace(/^\s*>\s?/, ""))
    .join("\n")
    .trim();
  return { title, body };
}

export function serializeCallout(title: string, body: string): string {
  const head = `> [!note]${title.trim() ? ` ${title.trim()}` : ""}`;
  const rest = body.trim() ? body.trim().split("\n").map((l) => `> ${l}`.trimEnd()) : [];
  return [head, ...rest].join("\n");
}

/* ── The insert menu ─────────────────────────────────────────────────────── */

export type Insert = {
  key: string;
  label: string;
  hint: string;
  /** Keywords the menu filter also matches on. */
  terms: string[];
  /** `|` marks where the caret lands. */
  snippet: string;
  /** Block-level inserts start their own block rather than joining the line. */
  block?: true;
};

export const INSERTS: Insert[] = [
  // The levels skip a step each time so the three sizes are obviously apart:
  // "##" and "###" render too alike to be worth separate menu entries.
  { block: true as const, key: "h1", label: "Heading 1", hint: "Biggest · #", terms: ["h1", "title", "section"], snippet: "# |" },
  { block: true as const, key: "h2", label: "Heading 2", hint: "Middle · ###", terms: ["h2", "sub", "section"], snippet: "### |" },
  { block: true as const, key: "h3", label: "Heading 3", hint: "Smallest · ######", terms: ["h3", "sub", "minor"], snippet: "###### |" },
  { block: true as const, key: "bullet", label: "Bullet list", hint: "- item", terms: ["ul", "list", "point"], snippet: "- |" },
  { block: true as const, key: "number", label: "Numbered list", hint: "1. item", terms: ["ol", "ordered", "step"], snippet: "1. |" },
  { block: true as const, key: "todo", label: "Checklist", hint: "- [ ] task", terms: ["task", "check", "todo"], snippet: "- [ ] |" },
  { block: true as const, key: "quote", label: "Quote", hint: "> quoted", terms: ["blockquote", "cite"], snippet: "> |" },
  { block: true as const, key: "code", label: "Code block", hint: "Fenced, with syntax", terms: ["fence", "pre", "snippet"], snippet: "```\n|\n```" },
  { key: "inline", label: "Inline code", hint: "`code`", terms: ["mono", "tick"], snippet: "`|`" },
  {
    block: true as const,
    key: "table",
    label: "Table",
    hint: "3 columns",
    terms: ["grid", "columns", "rows"],
    snippet: "| | | |\n| --- | --- | --- |\n| | | |",
  },
  { block: true as const, key: "math", label: "Equation", hint: "$$ display maths $$", terms: ["latex", "formula", "maths", "equation"], snippet: "$$\n|\n$$" },
  { key: "imath", label: "Inline maths", hint: "$x^2$", terms: ["latex", "formula", "inline"], snippet: "$|$" },
  { block: true as const, key: "rule", label: "Divider", hint: "Horizontal rule", terms: ["hr", "line", "break"], snippet: "---" },
  { key: "link", label: "Link", hint: "[text](url)", terms: ["url", "href"], snippet: "[|]()" },
  { key: "bold", label: "Bold", hint: "**text**", terms: ["strong", "b"], snippet: "**|**" },
  { key: "italic", label: "Italic", hint: "*text*", terms: ["em", "i"], snippet: "*|*" },
  { block: true as const, key: "callout", label: "Callout", hint: "A highlighted box", terms: ["note", "aside", "highlight", "warning"], snippet: "> [!note] |" },
  {
    block: true as const,
    key: "columns",
    label: "Two columns",
    hint: "Side by side",
    // "2" as well as "two" - it's what you reach for in a hurry.
    terms: ["column", "2", "2col", "split", "side"],
    snippet: `::: columns\n|\n${COLUMN_SPLIT}\n\n:::`,
  },
];

/** Digits and their words are interchangeable when searching the menu. */
const NUMBER_WORDS: [digit: string, word: string][] = [
  ["1", "one"], ["2", "two"], ["3", "three"], ["4", "four"], ["5", "five"],
];

/** "2 col" and "two col" are the same search. */
function numberVariants(q: string): string[] {
  const out = new Set([q]);
  for (const [digit, word] of NUMBER_WORDS) {
    if (q.includes(digit)) out.add(q.replaceAll(digit, word));
    if (q.includes(word)) out.add(q.replaceAll(word, digit));
  }
  return [...out];
}

/**
 * Filter the insert menu by what's been typed after the trigger.
 *
 * Three rules earn their keep. A word in an entry's own label beats a keyword
 * borrowed by another entry, so "columns" offers Two columns rather than
 * Table (which lists "columns" among its keywords). A bare number is treated
 * as a keyword only, so "2" means two columns rather than the "2" sitting in
 * the label "Heading 2". And digits stand in for their words throughout, so
 * "2 col", "2col" and "two col" all find the same thing.
 */
export function filterInserts(query: string): Insert[] {
  const q = query.trim().toLowerCase();
  if (!q) return INSERTS;

  const scoreOne = (i: Insert, term: string) => {
    const label = i.label.toLowerCase();
    const words = label.split(/\s+/);
    const numeric = /^\d+$/.test(term);

    if (label === term) return 6;
    if (!numeric && words.includes(term)) return 5.5;
    if (i.terms.includes(term)) return 5;
    if (label.startsWith(term)) return 4;
    if (!numeric && words.some((w) => w.startsWith(term))) return 3;
    if (i.terms.some((t) => t.startsWith(term))) return 2;
    if (label.includes(term) || i.terms.some((t) => t.includes(term))) return 1;
    return 0;
  };

  const variants = numberVariants(q);
  const score = (i: Insert) => Math.max(...variants.map((v) => scoreOne(i, v)));

  return INSERTS.map((i) => ({ i, s: score(i) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.i);
}

/**
 * Apply a snippet, replacing the trigger text (the `[` and anything typed
 * after it). Returns the new text and where the caret should land.
 */
export function applyInsert(
  text: string,
  triggerStart: number,
  caret: number,
  insert: Insert,
): { text: string; caret: number } {
  const body = insert.snippet.replace("|", "");
  const offset = insert.snippet.indexOf("|");
  const next = text.slice(0, triggerStart) + body + text.slice(caret);
  return { text: next, caret: triggerStart + (offset === -1 ? body.length : offset) };
}
