/**
 * Line diffs, drawn the way GitHub draws them: hunks of changes with three
 * lines of context, and the changed words inside a changed line marked.
 *
 * Myers' O(ND) algorithm - the one git uses - so the result reads like a git
 * diff, and a doc of a few thousand lines diffs in well under a frame. Pure,
 * so it runs on every keystroke in the browser and in tests alike.
 */

export type Op = "eq" | "add" | "del";

/** One piece of a line: changed (inside an edited line) or not. */
export type Segment = { text: string; changed: boolean };

export type DiffLine = {
  op: Op;
  text: string;
  /** Line numbers, 1-based: old for eq/del, new for eq/add. */
  oldNo: number | null;
  newNo: number | null;
  /** For a del paired with an add (an edited line): the words that changed. */
  segments?: Segment[];
};

export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: DiffLine[] };

export type DiffStats = { added: number; removed: number };

/** Split into lines the way git counts them: a trailing newline ends the last line rather than starting another. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** Past this many edits a diff is a rewrite: shown as everything removed and
 *  everything added, as GitHub does, rather than holding a trace per edit
 *  (quadratic memory) for a result nobody reads line by line. */
const MAX_EDITS = 2000;

/** The shortest edit script from `a` to `b`, as eq/del/add steps. */
export function diffSeq<T>(a: T[], b: T[]): { op: Op; a: number; b: number }[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];

  // Forward pass: furthest-reaching path on each diagonal, per edit count.
  let found = max === 0;
  for (let d = 0; d <= max && !found; d++) {
    if (d > MAX_EDITS) {
      return [
        ...a.map((_, i) => ({ op: "del" as const, a: i, b: 0 })),
        ...b.map((_, j) => ({ op: "add" as const, a: n, b: j })),
      ];
    }
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) { found = true; break; }
    }
  }

  // Walk back through the trace to recover the path.
  const steps: { op: Op; a: number; b: number }[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1]) ? k + 1 : k - 1;
    const prevX = vd[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { x--; y--; steps.push({ op: "eq", a: x, b: y }); }
    if (d === 0) break;
    if (x === prevX) { y--; steps.push({ op: "add", a: x, b: y }); }
    else { x--; steps.push({ op: "del", a: x, b: y }); }
  }
  while (x > 0 && y > 0) { x--; y--; steps.push({ op: "eq", a: x, b: y }); }
  return steps.reverse();
}

/** Words and the spaces between them - what an edited line is diffed by. */
const tokens = (line: string) => line.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];

/** Mark which words changed between an old and new version of one line. */
export function wordSegments(oldLine: string, newLine: string): { old: Segment[]; new: Segment[] } {
  const a = tokens(oldLine);
  const b = tokens(newLine);
  const out = { old: [] as Segment[], new: [] as Segment[] };
  const push = (list: Segment[], text: string, changed: boolean) => {
    const last = list.at(-1);
    if (last && last.changed === changed) last.text += text;
    else list.push({ text, changed });
  };
  for (const s of diffSeq(a, b)) {
    if (s.op === "eq") { push(out.old, a[s.a], false); push(out.new, b[s.b], false); }
    else if (s.op === "del") push(out.old, a[s.a], true);
    else push(out.new, b[s.b], true);
  }
  return out;
}

/** Every line of `before` → `after`, numbered, with edited lines' words marked. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const lines: DiffLine[] = diffSeq(a, b).map((s) =>
    s.op === "eq" ? { op: "eq", text: a[s.a], oldNo: s.a + 1, newNo: s.b + 1 }
    : s.op === "del" ? { op: "del", text: a[s.a], oldNo: s.a + 1, newNo: null }
    : { op: "add", text: b[s.b], oldNo: null, newNo: s.b + 1 },
  );

  // A run of removals followed by a run of additions is an edit: pair them
  // up in order and mark the words that changed - unless almost everything
  // did, where marking it all is just noise.
  for (let i = 0; i < lines.length; ) {
    if (lines[i].op !== "del") { i++; continue; }
    let j = i;
    while (j < lines.length && lines[j].op === "del") j++;
    let k = j;
    while (k < lines.length && lines[k].op === "add") k++;
    for (let p = 0; p < Math.min(j - i, k - j); p++) {
      const del = lines[i + p];
      const add = lines[j + p];
      const seg = wordSegments(del.text, add.text);
      const kept = seg.new.filter((s) => !s.changed).reduce((n, s) => n + s.text.trim().length, 0);
      if (kept >= Math.min(del.text.trim().length, add.text.trim().length) * 0.3) {
        del.segments = seg.old;
        add.segments = seg.new;
      }
    }
    i = Math.max(k, i + 1);
  }
  return lines;
}

export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.op === "add") added++;
    else if (l.op === "del") removed++;
  }
  return { added, removed };
}

/** The changes, grouped into hunks with `context` unchanged lines around each. */
export function toHunks(lines: DiffLine[], context = 3): Hunk[] {
  const changed = lines.map((l, i) => (l.op === "eq" ? -1 : i)).filter((i) => i >= 0);
  if (changed.length === 0) return [];
  const hunks: Hunk[] = [];
  let start = Math.max(0, changed[0] - context);
  let end = Math.min(lines.length - 1, changed[0] + context);
  const close = () => {
    const slice = lines.slice(start, end + 1);
    const firstOld = slice.find((l) => l.oldNo != null)?.oldNo;
    const firstNew = slice.find((l) => l.newNo != null)?.newNo;
    const oldLines = slice.filter((l) => l.op !== "add").length;
    const newLines = slice.filter((l) => l.op !== "del").length;
    // Git's convention: an empty side starts at the line before.
    const before = lines.slice(0, start);
    const oldBefore = before.filter((l) => l.op !== "add").length;
    const newBefore = before.filter((l) => l.op !== "del").length;
    hunks.push({
      oldStart: oldLines ? firstOld! : oldBefore,
      oldLines,
      newStart: newLines ? firstNew! : newBefore,
      newLines,
      lines: slice,
    });
  };
  for (const i of changed.slice(1)) {
    if (i - context <= end + 1) end = Math.min(lines.length - 1, i + context);
    else {
      close();
      start = Math.max(0, i - context);
      end = Math.min(lines.length - 1, i + context);
    }
  }
  close();
  return hunks;
}
