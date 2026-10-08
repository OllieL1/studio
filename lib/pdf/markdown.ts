import { newDoc, FAINT, INK, MARGIN, MUTED, RULE, RUST, CALLOUT_BG } from "./doc";
import { ascent, drawMath, measureMath } from "./math";
import { mentionHref, parseIssueRef } from "../mentions";

/**
 * Markdown as drawn PDF content.
 *
 * Studio's notes are markdown, and a PDF has no HTML renderer to lean on, so
 * this walks the source and draws it: headings, lists, quotes, fenced code,
 * tables, rules, and inline bold/italic/code/links. Anything it doesn't
 * recognise is drawn as plain text, so nothing is ever silently swallowed.
 *
 * Images are skipped - they'd need fetching, and Studio runs offline from a
 * USB stick. Their alt text is kept so the reader knows one was there.
 *
 * Maths is typeset by MathJax into SVG paths and drawn into the page (see
 * ./math.ts), inline as well as display. LaTeX that won't parse falls back to
 * its source in the mono face, so a typo never loses the line.
 */

export type MdStyle = {
  /** Body size in points; headings scale from it. */
  size: number;
  x: number;
  width: number;
  /** Called before drawing a block, so the caller can break the page. */
  ensure?: (height: number) => void;
};

type Inline = { text: string; font: "body" | "bold" | "italic" | "mono" | "maths"; colour: string; link?: string };

const HEADING_SCALE = [1.7, 1.42, 1.2, 1.06, 1, 1];

export function renderMarkdown(doc: PDFKit.PDFDocument, md: string, style: MdStyle) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    // ── Fenced code: gather to the closing fence and draw as one block.
    const fence = /^\s*```(\w*)\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      codeBlock(doc, body, style);
      continue;
    }

    // ── Display maths: $$ … $$, centred as its source.
    if (/^\s*\$\$/.test(line)) {
      const body: string[] = [];
      const oneLiner = /^\s*\$\$(.+)\$\$\s*$/.exec(line);
      if (oneLiner) {
        body.push(oneLiner[1].trim());
      } else {
        i++;
        while (i < lines.length && !/\$\$\s*$/.test(lines[i])) body.push(lines[i++]);
        if (i < lines.length) body.push(lines[i].replace(/\$\$\s*$/, ""));
      }
      const text = body.join(" ").trim();
      if (text) {
        const maths = measureMath(text, style.size * 1.15, true);
        if (maths) {
          style.ensure?.(maths.height + 14);
          doc.moveDown(0.4);
          const top = doc.y;
          // Wide equations are scaled down rather than run off the page.
          const scale = Math.min(1, style.width / maths.width);
          const width = maths.width * scale;
          const height = maths.height * scale;
          const fitted = scale === 1 ? maths : {
            ...maths,
            width,
            height,
            svg: maths.svg
              .replace(/width="[\d.]+"/, `width="${width.toFixed(3)}"`)
              .replace(/height="[\d.]+"/, `height="${height.toFixed(3)}"`),
          };
          drawMath(doc, fitted, style.x + (style.width - width) / 2, top);
          doc.y = top + height + 6;
        } else {
          style.ensure?.(style.size + 12);
          doc.moveDown(0.35);
          doc.font("mono").fontSize(style.size * 0.95).fillColor(INK)
            .text(text, style.x, doc.y, { width: style.width, align: "center" });
          doc.moveDown(0.35);
          doc.fillColor(INK);
        }
      }
      continue;
    }

    // ── Callout: `> [!note]`, drawn as a tinted box around its content.
    const callout = /^\s*>\s*\[!(\w+)\][ \t]*(.*)$/.exec(line);
    if (callout) {
      const body: string[] = [];
      i++;
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      i--;
      drawCallout(doc, callout[2].trim(), body.join("\n").trim(), style);
      continue;
    }

    // ── Two columns: `::: columns` … `|||` … `:::`.
    if (/^\s*:::\s*columns/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") body.push(lines[i++]);
      const at = body.findIndex((l) => l.trim() === "|||");
      const left = (at === -1 ? body : body.slice(0, at)).join("\n").trim();
      const right = at === -1 ? "" : body.slice(at + 1).join("\n").trim();
      drawColumns(doc, left, right, style);
      continue;
    }

    // ── Table: a header row followed by a separator of dashes.
    if (line.includes("|") && /^\s*\|?[\s:-]*-[\s:|-]*\|/.test(lines[i + 1] ?? "")) {
      const rows: string[][] = [];
      const header = splitRow(line);
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(splitRow(lines[i++]));
      i--;
      table(doc, header, rows, style);
      continue;
    }

    if (!line.trim()) {
      doc.moveDown(0.4);
      continue;
    }

    // ── Horizontal rule.
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      doc.moveDown(0.3);
      const y = doc.y;
      doc.moveTo(style.x, y).lineTo(style.x + style.width, y).lineWidth(0.5).strokeColor(RULE).stroke();
      doc.y = y + 8;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const size = style.size * HEADING_SCALE[level - 1];
      style.ensure?.(size + 14);
      doc.moveDown(level <= 2 ? 0.7 : 0.5);
      // h1/h2 use the display face, the rest stay in the body face at weight.
      const font = level <= 2 ? "display" : "bold";
      inline(doc, parseInline(heading[2], font === "display" ? "bold" : "bold"), {
        ...style,
        size,
        font,
      });
      if (level === 1) {
        const y = doc.y + 2;
        doc.moveTo(style.x, y).lineTo(style.x + style.width, y).lineWidth(0.5).strokeColor(RULE).stroke();
        doc.y = y + 6;
      }
      continue;
    }

    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const indentSpaces = (bullet ? bullet[1] : numbered![1]).length;
      const depth = Math.min(2, Math.floor(indentSpaces / 2));
      const marker = bullet ? (depth === 0 ? "•" : "–") : `${numbered![2]}.`;
      const indent = 12 + depth * 14;
      const text = bullet ? bullet[2] : numbered![3];

      style.ensure?.(style.size + 6);
      const y = doc.y;
      doc.font("body").fontSize(style.size).fillColor(FAINT).text(marker, style.x + depth * 14, y, {
        width: indent - 4,
        lineBreak: false,
      });
      doc.y = y;
      inline(doc, parseInline(text), { ...style, x: style.x + indent, width: style.width - indent });
      continue;
    }

    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      style.ensure?.(style.size + 8);
      const y = doc.y;
      inline(doc, parseInline(quote[1]), { ...style, x: style.x + 12, width: style.width - 12, colour: MUTED });
      doc.moveTo(style.x + 3, y + 1).lineTo(style.x + 3, doc.y - 2).lineWidth(1.5).strokeColor(RULE).stroke();
      continue;
    }

    style.ensure?.(style.size + 6);
    inline(doc, parseInline(line), style);
  }
}

/* ── Inline ──────────────────────────────────────────────────────────────── */

const SPLIT =
  /(@[r#tnmiu]\[[^\]|]+(?:\|[^\]]*)?\]|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|\$[^$\n]+\$|!?\[[^\]]*\]\([^)]+\))/g;

export function parseInline(text: string, base: Inline["font"] = "body"): Inline[] {
  return text
    .split(SPLIT)
    .filter((p) => p !== "" && p !== undefined)
    .map((part): Inline => {
      // A mention prints as its label, in the accent colour; a link chip also
      // keeps its target, since a printed page can still be clicked.
      const mention = /^@([r#tnmiu])\[([^\]|]+)(?:\|([^\]]*))?\]$/.exec(part);
      if (mention) {
        const id = mention[2].trim();
        const label = (mention[3] ?? mention[2]).trim();
        if (mention[1] === "#") return { text: `#${id}`, font: "bold", colour: RUST };
        if (mention[1] === "u") return { text: label, font: base, colour: RUST, link: id };
        if (mention[1] === "i") {
          const ref = parseIssueRef(id);
          return {
            text: ref ? `#${ref.number} ${label === id ? "" : label}`.trim() : label,
            font: "bold", colour: RUST, link: mentionHref("issue", id),
          };
        }
        return { text: label, font: "bold", colour: RUST };
      }

      const link = /^\[([^\]]*)\]\(([^)]+)\)$/.exec(part);
      const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(part);
      if (image) return { text: image[1] ? `[image: ${image[1]}]` : "[image]", font: "italic", colour: FAINT };
      if (link) return { text: link[1], font: base, colour: RUST, link: link[2] };
      if (/^(\*\*|__)/.test(part) && part.length > 4) return { text: part.slice(2, -2), font: "bold", colour: INK };
      if (/^(\*|_)/.test(part) && part.length > 2) return { text: part.slice(1, -1), font: "italic", colour: INK };
      if (/^`/.test(part) && part.length > 2) return { text: part.slice(1, -1), font: "mono", colour: RUST };
      // Inline maths: the dollars are syntax, the LaTeX inside is typeset.
      if (/^\$[^$]+\$$/.test(part)) return { text: part.slice(1, -1), font: "maths", colour: INK };
      return { text: part, font: base, colour: INK };
    });
}

/** Draw one line's worth of inline runs, continuing across the same wrap. */
function inline(
  doc: PDFKit.PDFDocument,
  parts: Inline[],
  style: MdStyle & { colour?: string; font?: string },
) {
  if (parts.length === 0) return;
  const baseColour = style.colour ?? INK;

  // A line with maths in it is laid out by hand: pdfkit's text flow has no way
  // to carry a drawing along with the words.
  if (parts.some((p) => p.font === "maths")) {
    richLine(doc, parts, { ...style, colour: baseColour });
    return;
  }

  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    const font = style.font && p.font === "body" ? style.font : p.font;
    // Code sits slightly smaller: JetBrains Mono runs large next to Inter.
    const size = p.font === "mono" ? style.size * 0.92 : style.size;
    doc.font(font).fontSize(size).fillColor(p.colour === INK ? baseColour : p.colour);
    const opts = { width: style.width, continued: !last, lineGap: 2, link: p.link };
    if (i === 0) doc.text(p.text, style.x, doc.y, opts);
    else doc.text(p.text, opts);
  });

  doc.fillColor(INK);
}

/**
 * Greedy line layout for a line containing maths: words and equations are
 * measured, placed, and wrapped at the column width, with each equation sat on
 * the text's own baseline.
 */
function richLine(doc: PDFKit.PDFDocument, parts: Inline[], style: MdStyle & { colour: string; font?: string }) {
  type Piece =
    | { kind: "word"; text: string; font: string; colour: string; link?: string; width: number }
    | { kind: "maths"; maths: NonNullable<ReturnType<typeof measureMath>>; width: number };

  const pieces: Piece[] = [];
  const space = () => {
    doc.font("body").fontSize(style.size);
    return doc.widthOfString(" ");
  };
  const spaceWidth = space();

  for (const part of parts) {
    if (part.font === "maths") {
      const maths = measureMath(part.text, style.size, false);
      if (maths) {
        // A hair either side, so an italic n never touches the next word.
        pieces.push({ kind: "maths", maths, width: maths.width + style.size * 0.12 });
        continue;
      }
      // Unparseable: fall back to the source in mono.
      pieces.push(...words({ ...part, font: "mono" }));
      continue;
    }
    pieces.push(...words(part));
  }

  function words(part: Inline): Piece[] {
    const font = style.font && part.font === "body" ? style.font : part.font;
    doc.font(font).fontSize(style.size);
    return part.text
      .split(/(\s+)/)
      .filter((w) => w !== "")
      .map((w) => ({
        kind: "word" as const,
        text: w,
        font,
        colour: part.colour === INK ? style.colour : part.colour,
        link: part.link,
        width: doc.widthOfString(w),
      }));
  }

  const lineHeight = Math.max(style.size * 1.35, ...pieces.map((p) => (p.kind === "maths" ? p.maths.height : 0)) );
  let x = style.x;
  let y = doc.y;

  for (const piece of pieces) {
    const isSpace = piece.kind === "word" && !piece.text.trim();
    if (x + piece.width > style.x + style.width && !isSpace && x > style.x) {
      x = style.x;
      y += lineHeight;
    }
    if (piece.kind === "maths") {
      const base = y + ascent(doc, style.size);
      drawMath(doc, piece.maths, x + style.size * 0.06, base - piece.maths.height + piece.maths.descent);
    } else {
      doc.font(piece.font).fontSize(style.size).fillColor(piece.colour);
      doc.text(piece.text, x, y, { lineBreak: false, link: piece.link });
    }
    x += piece.width + (isSpace ? 0 : 0);
  }

  doc.x = style.x;
  doc.y = y + lineHeight;
  doc.fillColor(INK);
}

/**
 * A callout, drawn twice: once to measure how tall its content is, then for
 * real on top of the box. pdfkit has no way to draw a background behind
 * content that hasn't been laid out yet.
 */
function drawCallout(doc: PDFKit.PDFDocument, title: string, body: string, style: MdStyle) {
  const pad = 9;
  const inner = { ...style, x: style.x + pad + 3, width: style.width - pad * 2 - 3 };

  const height = measure(inner.width, (probe, width) => {
    if (title) {
      probe.font("bold").fontSize(style.size).fillColor(INK);
      probe.text(title, probe.x, probe.y, { width });
    }
    if (body) renderMarkdown(probe, body, { size: style.size, x: probe.x, width });
  });

  style.ensure?.(height + pad * 2 + 8);
  doc.moveDown(0.3);
  const top = doc.y;

  doc.roundedRect(style.x, top, style.width, height + pad * 2, 6)
    .fillColor(CALLOUT_BG).fill();
  doc.rect(style.x, top, 2.5, height + pad * 2).fillColor(RUST).fill();

  doc.y = top + pad;
  if (title) {
    doc.font("bold").fontSize(style.size).fillColor(RUST);
    doc.text(title, inner.x, doc.y, { width: inner.width });
  }
  if (body) renderMarkdown(doc, body, { ...inner, ensure: undefined });
  doc.y = top + height + pad * 2 + 6;
  doc.fillColor(INK);
}

/** Two columns side by side; the block ends below whichever is taller. */
function drawColumns(doc: PDFKit.PDFDocument, left: string, right: string, style: MdStyle) {
  const gap = 18;
  const width = (style.width - gap) / 2;

  const tallest = Math.max(
    measure(width, (probe, w) => renderMarkdown(probe, left, { size: style.size, x: probe.x, width: w })),
    measure(width, (probe, w) => renderMarkdown(probe, right, { size: style.size, x: probe.x, width: w })),
  );

  // Measured on a throwaway document, so a tall pair breaks the page first
  // rather than splitting one column across the fold.
  style.ensure?.(tallest + 8);
  const start = doc.y;

  doc.y = start;
  renderMarkdown(doc, left, { ...style, x: style.x, width, ensure: undefined });
  const leftEnd = doc.y;

  doc.y = start;
  renderMarkdown(doc, right, { ...style, x: style.x + width + gap, width, ensure: undefined });

  doc.y = Math.max(leftEnd, doc.y) + 4;
  doc.x = style.x;
}

/**
 * How tall something would be, without drawing it.
 *
 * Measuring on the real document means adding a page and taking it away
 * again, which leaves pdfkit's page buffer and its page tree disagreeing -
 * the columns ended up on their own pages. So measurement happens in a
 * throwaway document that's never written out.
 */
let scratch: PDFKit.PDFDocument | null = null;

function measure(width: number, draw: (doc: PDFKit.PDFDocument, width: number) => void): number {
  if (!scratch) scratch = newDoc({ title: "measure", subject: "measure", createdAt: new Date() }).doc;
  scratch.addPage();
  const from = scratch.y;
  draw(scratch, width);
  return Math.max(0, scratch.y - from);
}

/* ── Blocks ──────────────────────────────────────────────────────────────── */

function codeBlock(doc: PDFKit.PDFDocument, body: string[], style: MdStyle) {
  const size = style.size * 0.86;
  const lineHeight = size * 1.45;
  const height = body.length * lineHeight + 10;
  style.ensure?.(height + 6);

  const top = doc.y + 2;
  doc.rect(style.x, top, style.width, height).fillColor(RULE).fillOpacity(0.5).fill().fillOpacity(1);
  doc.rect(style.x, top, 2, height).fillColor(RULE).fill();

  doc.font("mono").fontSize(size).fillColor(MUTED);
  body.forEach((l, i) => {
    doc.text(l || " ", style.x + 8, top + 5 + i * lineHeight, { width: style.width - 16, lineBreak: false });
  });
  doc.y = top + height + 6;
  doc.fillColor(INK);
}

const splitRow = (line: string) =>
  line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function table(doc: PDFKit.PDFDocument, header: string[], rows: string[][], style: MdStyle) {
  const cols = header.length;
  if (cols === 0) return;
  const size = style.size * 0.92;
  const rowHeight = size * 1.9;
  style.ensure?.(rowHeight * (rows.length + 1) + 10);

  const colWidth = style.width / cols;
  let y = doc.y + 4;

  doc.font("bold").fontSize(size).fillColor(MUTED);
  header.forEach((h, i) => {
    doc.text(h, style.x + i * colWidth, y, { width: colWidth - 6, lineBreak: false, ellipsis: true });
  });
  y += rowHeight * 0.85;
  doc.moveTo(style.x, y).lineTo(style.x + style.width, y).lineWidth(0.5).strokeColor(RULE).stroke();
  y += 4;

  rows.forEach((r) => {
    doc.font("body").fontSize(size).fillColor(INK);
    r.slice(0, cols).forEach((c, i) => {
      // Cells are single-line: a wrapped cell would desync the row heights.
      doc.text(c, style.x + i * colWidth, y, { width: colWidth - 6, lineBreak: false, ellipsis: true });
    });
    y += rowHeight * 0.8;
    doc.moveTo(style.x, y - 3).lineTo(style.x + style.width, y - 3).lineWidth(0.3).strokeColor(RULE).stroke();
  });

  doc.y = y + 4;
}

/** Plain text of a markdown string, for contents lines and summaries. */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Margin-aware default for a full-width block of notes. */
export const notesStyle = (doc: PDFKit.PDFDocument, size = 10): MdStyle => ({
  size,
  x: MARGIN,
  width: doc.page.width - MARGIN * 2,
});
