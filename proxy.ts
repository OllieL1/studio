import { NextResponse, type NextRequest } from "next/server";
import { LIVIO_HOST_ALIAS } from "@/lib/origin";
import { LIVIO_BASE } from "@/lib/apps";
import { db } from "@/lib/db";
import { activeLock, lockAllows, lockHome } from "@/lib/ultraFocus";

/**
 * Two jobs, both before a page renders.
 *
 * Rapt Mode (lib/ultraFocus.ts): while Studio is locked to a course, any
 * page outside it - home, the calendar, Livio, another course - redirects to
 * the locked course's page. Here rather than in the browser so a reload, a
 * typed address or a bookmark gets the same answer. Client-side navigations
 * pass through here too, as requests for the page's data.
 *
 * livio.localhost's front door: Studio and Livio are one process; on the
 * Livio alias, `/` shows Livio's home instead of Studio's. Every other path
 * passes straight through - Livio's own links already carry /livio, and
 * Studio's home on this host is `/?studio` (lib/apps.ts).
 */
export async function proxy(req: NextRequest) {
  const locked = await lockedRedirect(req);
  if (locked) return locked;

  const host = req.headers.get("host")?.split(":")[0];
  // `/?studio` is the way back to Studio's home from this host.
  if (req.nextUrl.pathname === "/" && host === LIVIO_HOST_ALIAS && !req.nextUrl.searchParams.has("studio")) {
    return NextResponse.rewrite(new URL(LIVIO_BASE, req.url));
  }
  return NextResponse.next();
}

async function lockedRedirect(req: NextRequest): Promise<NextResponse | null> {
  // Page loads only. Server actions are POSTs to whatever page they came
  // from, and stopping the session from a tab left open elsewhere has to
  // work - it's the way out.
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const timer = await db.activeTimer.findUnique({
    where: { id: "singleton" },
    select: { lockCourseId: true, lockUntil: true },
  });
  const lock = activeLock(timer);
  if (!lock) return null;
  const course = await db.course.findUnique({ where: { id: lock.courseId }, select: { id: true, isProject: true } });
  if (!course) return null;

  const verdict = lockAllows(req.nextUrl.pathname, course);
  if (verdict === "yes") return null;
  if (verdict !== "no") {
    const task = await db.task.findUnique({ where: { id: verdict.task }, select: { courseId: true } });
    if (task?.courseId === course.id) return null;
  }
  return NextResponse.redirect(new URL(lockHome(course), req.url));
}

export const config = {
  // Pages only: not API routes (PDFs, uploads, polling), Next's own files,
  // or anything with a file extension (icons, fonts).
  matcher: ["/((?!api|_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
