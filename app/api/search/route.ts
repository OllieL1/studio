import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { visibleCourseWhere } from "@/lib/types";

export type SearchHit = {
  id: string;
  type: "course" | "lecture" | "task" | "note" | "page";
  title: string;
  subtitle: string | null;
  href: string;
  colour: string | null;
  /** Matched excerpt, for note hits. */
  excerpt?: string | null;
};

const PAGES: SearchHit[] = [
  { id: "p-home", type: "page", title: "Home", subtitle: "Progress and today", href: "/", colour: null },
  { id: "p-stats", type: "page", title: "Stats", subtitle: "Analytics", href: "/stats", colour: null },
  { id: "p-lectures", type: "page", title: "Lectures", subtitle: "Notes and notebooks", href: "/lectures", colour: null },
  { id: "p-sessions", type: "page", title: "Sessions", subtitle: "Study history", href: "/sessions", colour: null },
];

/**
 * Global search behind ⌘K.
 *
 * Searches courses, lectures, tasks and the full text of typed notes. Results
 * are ranked so an exact prefix beats a substring, and courses/lectures beat
 * note bodies — you're usually navigating, not researching.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ hits: [] as SearchHit[] });

  const lower = q.toLowerCase();
  const where = visibleCourseWhere();

  const [courses, tasks] = await Promise.all([
    db.course.findMany({ where, orderBy: { position: "asc" } }),
    db.task.findMany({
      where: { cancelled: false, course: { is: where } },
      include: { course: { select: { shortName: true, colour: true, name: true } } },
      orderBy: [{ dueAt: "asc" }],
      take: 2000,
    }),
  ]);

  const hits: (SearchHit & { score: number })[] = [];

  for (const p of PAGES) {
    const s = score(p.title.toLowerCase(), lower);
    if (s > 0) hits.push({ ...p, score: s - 1 }); // pages rank just below content
  }

  for (const c of courses) {
    const s = Math.max(
      score(c.name.toLowerCase(), lower),
      score(c.shortName.toLowerCase(), lower),
      score(c.code.toLowerCase(), lower),
    );
    if (s > 0) {
      hits.push({
        id: c.id, type: "course", title: c.name, subtitle: c.code,
        href: `/courses/${c.id}`, colour: c.colour, score: s + 3,
      });
    }
  }

  for (const t of tasks) {
    const isLecture = t.kind === "LECTURE" || t.kind === "SEMINAR";
    const hay = `${t.title} ${t.course?.shortName ?? ""} ${t.notebook ?? ""}`.toLowerCase();
    const s = score(hay, lower);

    if (s > 0) {
      hits.push({
        id: t.id,
        type: isLecture ? "lecture" : "task",
        title: t.title,
        subtitle: [t.course?.name, t.notebook ? `${t.notebook}${t.notebookPages ? ` pp. ${t.notebookPages}` : ""}` : null]
          .filter(Boolean).join(" · ") || null,
        href: isLecture ? `/lectures/${t.id}` : `/courses/${t.courseId}`,
        colour: t.course?.colour ?? null,
        score: s + (isLecture ? 2 : 1),
      });
      continue;
    }

    // Full-text across typed notes, with the matching line as the excerpt.
    if (t.notesMd) {
      const idx = t.notesMd.toLowerCase().indexOf(lower);
      if (idx >= 0) {
        hits.push({
          id: t.id, type: "note", title: t.title,
          subtitle: t.course?.name ?? null,
          href: `/lectures/${t.id}`,
          colour: t.course?.colour ?? null,
          excerpt: excerptAround(t.notesMd, idx, lower.length),
          score: 1,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return NextResponse.json({ hits: hits.slice(0, 40).map(({ score: _s, ...h }) => h) });
}

/** 3 = exact, 2 = prefix, 1 = substring, 0 = no match. */
function score(haystack: string, needle: string): number {
  if (haystack === needle) return 3;
  if (haystack.startsWith(needle)) return 2;
  if (haystack.includes(needle)) return 1;
  // Match across word starts too, so "fp l3" finds "FP Lecture 3".
  const words = needle.split(/\s+/).filter(Boolean);
  return words.length > 1 && words.every((w) => haystack.includes(w)) ? 1 : 0;
}

function excerptAround(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + len + 55);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${slice}${end < text.length ? "…" : ""}`;
}
