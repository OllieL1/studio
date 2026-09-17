import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Task options for the timer's "tasks worked on" picker and the dependency
 *  picker. Scoped by course and, optionally, to unfinished tasks only. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const courseIds = params.get("courseIds")?.split(",").filter(Boolean) ?? [];
  const openOnly = params.get("open") === "1";
  const q = params.get("q")?.trim().toLowerCase() ?? "";

  const tasks = await db.task.findMany({
    where: {
      cancelled: false,
      ...(courseIds.length > 0 ? { courseId: { in: courseIds } } : {}),
      ...(q ? { title: { contains: q } } : {}),
    },
    include: { items: { select: { doneAt: true } } },
    orderBy: [{ dueAt: "asc" }, { title: "asc" }],
    take: 300,
  });

  const filtered = openOnly
    ? tasks.filter((t) =>
        t.items.length ? !t.items.every((i) => i.doneAt) : !t.doneAt,
      )
    : tasks;

  return NextResponse.json(
    filtered.slice(0, 80).map((t) => ({
      id: t.id,
      title: t.title,
      courseId: t.courseId,
      kind: t.kind,
    })),
  );
}
