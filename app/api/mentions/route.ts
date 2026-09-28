import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fmtDayDate } from "@/lib/dates";
import type { MentionKind } from "@/lib/mentions";

export const dynamic = "force-dynamic";

/**
 * What the `@` menu offers. `kind` narrows to one sort of thing (the `@r`,
 * `@#`, `@t`, `@n`, `@m` prefixes); without it every kind is searched and
 * the best few of each come back.
 *
 * Every kind is queried at once rather than one after another: this runs on
 * a keystroke, against a database on a USB stick, so five round trips in a
 * row is the difference between a menu that appears and one that doesn't.
 */

export type MentionOption = {
  kind: MentionKind;
  /** What goes in the stored token: a cite key, a tag name, or a record id. */
  id: string;
  label: string;
  hint: string;
};

const LIMIT_PER_KIND = 6;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const kind = req.nextUrl.searchParams.get("kind") as MentionKind | null;
  const want = (k: MentionKind) => !kind || kind === k;
  const like = { contains: q };

  const [papers, tags, tasks, notes, meetings] = await Promise.all([
    want("paper")
      ? db.paper.findMany({
          where: q ? { OR: [{ title: like }, { citeKey: like }, { authors: like }] } : undefined,
          orderBy: { createdAt: "desc" },
          take: LIMIT_PER_KIND,
          select: { citeKey: true, title: true, year: true },
        })
      : [],
    want("tag")
      ? db.tag.findMany({
          where: q ? { key: { contains: q.toLowerCase() } } : undefined,
          orderBy: { name: "asc" },
          take: LIMIT_PER_KIND,
          select: { name: true, _count: { select: { papers: true, notes: true } } },
        })
      : [],
    want("task")
      ? db.task.findMany({
          where: { cancelled: false, ...(q ? { title: like } : {}) },
          orderBy: [{ doneAt: "asc" }, { dueAt: "asc" }],
          take: LIMIT_PER_KIND,
          select: { id: true, title: true, doneAt: true, course: { select: { shortName: true } } },
        })
      : [],
    want("note")
      ? db.note.findMany({
          where: q ? { OR: [{ title: like }, { body: like }] } : undefined,
          orderBy: { updatedAt: "desc" },
          take: LIMIT_PER_KIND,
          select: { id: true, title: true },
        })
      : [],
    want("meeting")
      ? db.meeting.findMany({
          where: q ? { title: like } : undefined,
          orderBy: { startAt: "desc" },
          take: LIMIT_PER_KIND,
          select: { id: true, title: true, startAt: true },
        })
      : [],
  ]);

  const options: MentionOption[] = [
    ...papers.map((p) => ({
      kind: "paper" as const,
      id: p.citeKey,
      label: p.title,
      hint: [p.citeKey, p.year].filter(Boolean).join(" · "),
    })),
    ...tags.map((t) => ({
      kind: "tag" as const,
      id: t.name,
      label: t.name,
      hint: `${t._count.papers + t._count.notes} tagged`,
    })),
    ...tasks.map((t) => ({
      kind: "task" as const,
      id: t.id,
      label: t.title,
      hint: [t.course?.shortName, t.doneAt ? "done" : null].filter(Boolean).join(" · "),
    })),
    ...notes.map((n) => ({ kind: "note" as const, id: n.id, label: n.title, hint: "note" })),
    ...meetings.map((m) => ({
      kind: "meeting" as const,
      id: m.id,
      label: m.title,
      hint: fmtDayDate(m.startAt),
    })),
  ];

  return NextResponse.json({ options });
}
