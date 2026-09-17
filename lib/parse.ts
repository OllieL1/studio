import { addDays, startOfDay, toISODate } from "./dates";

/**
 * Natural-language task parser.
 *
 * Lets a whole task be typed in one line instead of filled into eight fields:
 *
 *   "FP programming exercise fri 5pm !20%"
 *   → title "programming exercise", course FP, due Fri 17:00, priority, 20%
 *
 * Every token it consumes is echoed back as a chip in the UI, so the parse is
 * always visible and never silently wrong.
 */

export type ParsedTask = {
  title: string;
  courseId: string | null;
  kind: string | null;
  dueDate: string | null; // YYYY-MM-DD
  dueTime: string | null; // HH:MM
  priority: boolean;
  gradeWeight: number | null;
  /** Character ranges consumed, so the input can highlight them. */
  matched: { text: string; type: string }[];
};

export type ParseCourse = { id: string; shortName: string; code: string; name: string };

const KIND_WORDS: Record<string, string> = {
  lecture: "LECTURE", lec: "LECTURE",
  lab: "LAB",
  seminar: "SEMINAR",
  coursework: "COURSEWORK", cw: "COURSEWORK", essay: "COURSEWORK",
  assignment: "COURSEWORK", report: "COURSEWORK", poster: "COURSEWORK",
  quiz: "QUIZ",
  exam: "EXAM",
};

const DOW: Record<string, number> = {
  mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5,
  sat: 6, saturday: 6, sun: 7, sunday: 7,
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export function parseTask(
  raw: string,
  courses: ParseCourse[],
  now: Date = new Date(),
): ParsedTask {
  let text = ` ${raw} `;
  const matched: { text: string; type: string }[] = [];

  const eat = (re: RegExp, type: string, fn: (m: RegExpMatchArray) => void): boolean => {
    const m = text.match(re);
    if (!m) return false;
    fn(m);
    matched.push({ text: m[0].trim(), type });
    text = text.replace(m[0], " ");
    return true;
  };

  const out: ParsedTask = {
    title: "", courseId: null, kind: null, dueDate: null,
    dueTime: null, priority: false, gradeWeight: null, matched,
  };

  // Priority: a bare "!" anywhere.
  eat(/\s!(?=\s)/i, "priority", () => { out.priority = true; });

  // Grade weight: "20%".
  eat(/\s(\d{1,3}(?:\.\d+)?)%(?=\s)/, "weight", (m) => {
    out.gradeWeight = Number(m[1]);
  });

  // Course: "@fp", or a bare short name / code.
  for (const c of courses) {
    const short = escapeRe(c.shortName);
    const code = escapeRe(c.code);
    if (
      eat(new RegExp(`\\s@?(${short}|${code})(?=\\s)`, "i"), "course", () => {
        out.courseId = c.id;
      })
    ) break;
  }

  // Kind. An explicit "#lab" is consumed; a bare "essay" only *infers* the
  // kind and stays in the title — otherwise "coursework 40%" would parse to
  // a task with no name at all.
  let kindTaken = false;
  for (const [word, kind] of Object.entries(KIND_WORDS)) {
    if (eat(new RegExp(`\\s#(${word})(?=\\s)`, "i"), "kind", () => { out.kind = kind; })) {
      kindTaken = true;
      break;
    }
  }
  if (!kindTaken) {
    // Earliest bare keyword wins, so "lab report" reads as a lab, not a report.
    let best: { index: number; kind: string } | null = null;
    for (const [word, kind] of Object.entries(KIND_WORDS)) {
      const m = text.match(new RegExp(`\\s(${word})(?=\\s)`, "i"));
      if (m?.index != null && (best === null || m.index < best.index)) {
        best = { index: m.index, kind };
      }
    }
    if (best) out.kind = best.kind;
  }

  // Time: "5pm", "17:00", "16.30".
  eat(/\s(?:at\s+)?(\d{1,2})(?::|\.)(\d{2})\s*(am|pm)?(?=\s)/i, "time", (m) => {
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = m[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    out.dueTime = `${pad(h)}:${pad(min)}`;
  });
  if (!out.dueTime) {
    eat(/\s(\d{1,2})\s*(am|pm)(?=\s)/i, "time", (m) => {
      let h = Number(m[1]);
      if (m[2].toLowerCase() === "pm" && h < 12) h += 12;
      if (m[2].toLowerCase() === "am" && h === 12) h = 0;
      out.dueTime = `${pad(h)}:00`;
    });
  }

  // Dates, most specific first.
  const today = startOfDay(now);
  const setDate = (d: Date) => { out.dueDate = toISODate(d); };

  const dateFound =
    // ISO: 2026-11-20
    eat(/\s(\d{4})-(\d{2})-(\d{2})(?=\s)/, "date", (m) => {
      setDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }) ||
    // 20/11 or 20/11/2026 (day first — UK)
    eat(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/, "date", (m) => {
      const year = m[3] ? normYear(Number(m[3])) : inferYear(Number(m[2]), Number(m[1]), now);
      setDate(new Date(year, Number(m[2]) - 1, Number(m[1])));
    }) ||
    // "3 oct" / "3rd october" / "oct 3"
    eat(/\s(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*(?=\s)/i, "date", (m) => {
      const mo = MONTHS[m[2].toLowerCase()];
      setDate(new Date(inferYear(mo, Number(m[1]), now), mo - 1, Number(m[1])));
    }) ||
    eat(/\s(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?=\s)/i, "date", (m) => {
      const mo = MONTHS[m[1].toLowerCase()];
      setDate(new Date(inferYear(mo, Number(m[2]), now), mo - 1, Number(m[2])));
    }) ||
    eat(/\stoday(?=\s)/i, "date", () => setDate(today)) ||
    eat(/\stomorrow(?=\s)/i, "date", () => setDate(addDays(today, 1))) ||
    // "in 3d" / "in 2 weeks"
    eat(/\sin\s+(\d{1,2})\s*(d|days?|w|weeks?)(?=\s)/i, "date", (m) => {
      const n = Number(m[1]);
      setDate(addDays(today, /^w/i.test(m[2]) ? n * 7 : n));
    }) ||
    // "next mon" / "mon"
    eat(/\s(next\s+)?(mon|monday|tue|tues|tuesday|wed|weds|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)(?=\s)/i, "date", (m) => {
      const target = DOW[m[2].toLowerCase()];
      const cur = ((today.getDay() + 6) % 7) + 1;
      let delta = (target - cur + 7) % 7;
      if (delta === 0) delta = 7;           // "mon" on a Monday means next Monday
      if (m[1]) delta += delta <= 7 ? 7 : 0; // "next mon" pushes a week further
      setDate(addDays(today, delta));
    });

  void dateFound;

  out.title = text.replace(/\s+/g, " ").trim();
  return out;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function normYear(y: number) {
  return y < 100 ? 2000 + y : y;
}

/** Pick the year that puts the date in the near future — a September user
 *  typing "3 mar" means next March, not one six months gone. */
function inferYear(month: number, day: number, now: Date): number {
  const y = now.getFullYear();
  const candidate = new Date(y, month - 1, day);
  const cutoff = addDays(startOfDay(now), -14);
  return candidate < cutoff ? y + 1 : y;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
