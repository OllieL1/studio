/**
 * Markdown tables as a grid.
 *
 * Typing pipes by hand is the worst part of markdown, so the editor edits a
 * table as cells and writes the markdown back out. Parsing is deliberately
 * forgiving - a half-typed table still opens as a grid - and serialising pads
 * the columns so the source stays readable if you ever look at it raw.
 */

export type Align = "left" | "center" | "right";

export type Table = {
  header: string[];
  align: Align[];
  rows: string[][];
};

const splitRow = (line: string): string[] => {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  // A backslash-escaped pipe is content, not a separator.
  return trimmed.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
};

const isSeparator = (line: string) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");

export function parseTable(md: string): Table | null {
  const lines = md.split("\n").filter((l) => l.trim());
  if (lines.length === 0 || !lines[0].includes("|")) return null;

  const header = splitRow(lines[0]);
  const hasSep = lines.length > 1 && isSeparator(lines[1]);
  const align: Align[] = hasSep
    ? splitRow(lines[1]).map((c) => {
        const left = c.startsWith(":");
        const right = c.endsWith(":");
        return left && right ? "center" : right ? "right" : "left";
      })
    : header.map(() => "left");

  const rows = lines.slice(hasSep ? 2 : 1).map(splitRow);
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  return {
    header: fit(header, width),
    align: fit(align, width, "left"),
    rows: rows.map((r) => fit(r, width)),
  };
}

function fit<T>(row: T[], width: number, filler: T = "" as T): T[] {
  const out = row.slice(0, width);
  while (out.length < width) out.push(filler);
  return out;
}

export function serializeTable(t: Table): string {
  const width = t.header.length;
  const escape = (c: string) => c.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const cells = [t.header, ...t.rows].map((r) => fit(r, width).map(escape));

  // Pad every column to its widest cell, so the raw markdown lines up.
  const widths = Array.from({ length: width }, (_, i) =>
    Math.max(3, ...cells.map((r) => r[i]?.length ?? 0)),
  );
  const line = (r: string[]) => `| ${r.map((c, i) => c.padEnd(widths[i])).join(" | ")} |`;
  const sep = `| ${t.align
    .map((a, i) => {
      const dashes = "-".repeat(Math.max(3, widths[i]));
      if (a === "center") return `:${dashes.slice(2)}:`;
      if (a === "right") return `${dashes.slice(1)}:`;
      return dashes;
    })
    .join(" | ")} |`;

  return [line(cells[0]), sep, ...cells.slice(1).map(line)].join("\n");
}

/* ── Editing ─────────────────────────────────────────────────────────────── */

export const emptyTable = (cols = 3, rows = 2): Table => ({
  header: Array(cols).fill(""),
  align: Array(cols).fill("left"),
  rows: Array.from({ length: rows }, () => Array(cols).fill("")),
});

export function setCell(t: Table, row: number, col: number, value: string): Table {
  if (row === -1) {
    const header = [...t.header];
    header[col] = value;
    return { ...t, header };
  }
  const rows = t.rows.map((r, i) => (i === row ? r.map((c, j) => (j === col ? value : c)) : r));
  return { ...t, rows };
}

export function addRow(t: Table, after: number): Table {
  const blank = Array(t.header.length).fill("");
  const rows = [...t.rows];
  rows.splice(after + 1, 0, blank);
  return { ...t, rows };
}

export function removeRow(t: Table, row: number): Table {
  if (t.rows.length <= 1) return { ...t, rows: [Array(t.header.length).fill("")] };
  return { ...t, rows: t.rows.filter((_, i) => i !== row) };
}

export function addColumn(t: Table, after: number): Table {
  const at = after + 1;
  const insert = <T,>(arr: T[], v: T) => [...arr.slice(0, at), v, ...arr.slice(at)];
  return {
    header: insert(t.header, ""),
    align: insert(t.align, "left" as Align),
    rows: t.rows.map((r) => insert(r, "")),
  };
}

export function removeColumn(t: Table, col: number): Table {
  if (t.header.length <= 1) return t;
  const drop = <T,>(arr: T[]) => arr.filter((_, i) => i !== col);
  return { header: drop(t.header), align: drop(t.align), rows: t.rows.map(drop) };
}

export function setAlign(t: Table, col: number, align: Align): Table {
  return { ...t, align: t.align.map((a, i) => (i === col ? align : a)) };
}

/** Where Tab goes next: along the row, then onto the next one. */
export function nextCell(t: Table, row: number, col: number, back = false): { row: number; col: number } | "append" {
  const cols = t.header.length;
  const flat = (row + 1) * cols + col; // header is row -1
  const next = back ? flat - 1 : flat + 1;
  if (next < 0) return { row: -1, col: 0 };
  if (next >= (t.rows.length + 1) * cols) return "append";
  return { row: Math.floor(next / cols) - 1, col: next % cols };
}
