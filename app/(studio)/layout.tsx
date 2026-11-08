import type { Metadata, Viewport } from "next";
import "../globals.css";
import { fontVariables } from "../fonts";
import { Nav } from "@/components/Nav";
import { repoMenu } from "@/lib/githubData";
import { TimerBar } from "@/components/TimerBar";
import { CommandPalette } from "@/components/CommandPalette";
import { GlobalQuickAdd } from "@/components/GlobalQuickAdd";
import { SessionHotkey } from "@/components/SessionHotkey";
import { EnhancementHotkey } from "@/components/EnhancementHotkey";
import { DueSoonBanner } from "@/components/DueSoonBanner";
import { LastLecture } from "@/components/LastLecture";
import { BusyBar } from "@/components/BusyBar";
import { getActiveTimer, getDueSoon } from "@/lib/queries";
import { db } from "@/lib/db";
import { isStudyLocation, visibleCourseWhere } from "@/lib/types";
import { getPreferences } from "@/lib/preferences";
import { isGoogleConfigured } from "@/lib/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { FocusLockBar } from "@/components/FocusLockBar";
import { activeLock, lockHome } from "@/lib/ultraFocus";

/**
 * The browser paints its own canvas before our first byte lands, and it picks
 * that colour from `color-scheme`. Without this, a cold load in dark mode
 * shows one white frame before the page appears.
 */
export async function generateViewport(): Promise<Viewport> {
  const { theme } = await getPreferences();
  return { colorScheme: theme, themeColor: theme === "dark" ? "#141210" : "#fbfaf8" };
}

export const metadata: Metadata = {
  title: "Studio - 26/27",
  description: "Studio - fifth-year study planner",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The timer and course list live in the shell, so they're fetched once here
  // rather than by every page.
  const [prefs, timer, courses, lastSession, googleAuth, repos, dueSoon] = await Promise.all([
    getPreferences(),
    getActiveTimer(),
    db.course.findMany({
      where: visibleCourseWhere(),
      orderBy: { position: "asc" },
      select: { id: true, name: true, shortName: true, colour: true, code: true, isProject: true, moodleUrl: true },
    }),
    // The stop dialog pre-selects wherever the last session was.
    db.session.findFirst({
      where: { location: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { location: true, locationNote: true },
    }),
    // For the Ctrl-/ quick-add's Google Calendar toggle.
    isGoogleConfigured()
      ? db.googleAuth.findUnique({ where: { id: "singleton" }, select: { id: true } })
      : Promise.resolve(null),
    repoMenu(),
    getDueSoon(),
  ]);
  const calendarConnected = !!googleAuth;
  // Ultra focus: the locked course, if a lock is on. The proxy keeps every
  // other page out of reach; this strips the shell down to the page itself.
  const lock = activeLock(timer);
  const lockCourse = lock ? courses.find((c) => c.id === lock.courseId) : undefined;

  return (
    // The theme is decided here, on the server, so the first paint is already
    // the right one. A client-side toggle would flash the light page first.
    <html
      lang="en-GB"
      data-theme={prefs.theme}
      className={fontVariables}
      // Belt and braces: the page is painted before the stylesheet applies.
      style={{ background: prefs.theme === "dark" ? "#141210" : "#fbfaf8" }}
    >
      <body>
        <ThemeProvider
          initial={prefs.theme}
          mode={prefs.mode}
          darkFrom={prefs.darkFrom}
          darkTo={prefs.darkTo}
        >
        <div className="relative z-10 flex min-h-screen flex-col">
          {lock && lockCourse ? (
            <FocusLockBar until={lock.until.toISOString()} course={lockCourse} home={lockHome(lockCourse)} />
          ) : (
            <>
              <Nav courses={courses} repos={repos} />
              <DueSoonBanner initial={dueSoon} />
            </>
          )}
          <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 pb-32 pt-8 sm:px-8">
            {children}
          </main>
          {/* Search, quick-add, the last lecture and the queue all lead
              elsewhere - none of them while ultra focus is on. */}
          {!lock && (
            <>
              <CommandPalette />
              <LastLecture />
              <GlobalQuickAdd courses={courses} calendarConnected={calendarConnected} />
              <EnhancementHotkey />
            </>
          )}
          <SessionHotkey
            clock={timer ? { startedAt: timer.startedAt.toISOString(), pausedAt: timer.pausedAt?.toISOString() ?? null, pausedMs: timer.pausedMs } : null}
          />
          <TimerBar
            startedAt={timer?.startedAt.toISOString() ?? null}
            pausedAt={timer?.pausedAt?.toISOString() ?? null}
            pausedMs={timer?.pausedMs ?? 0}
            locked={!!lock}
            draftName={timer?.draftName ?? null}
            courses={courses}
            lastLocation={isStudyLocation(lastSession?.location) ? lastSession.location : null}
            lastLocationNote={lastSession?.locationNote ?? null}
          />
        </div>
        {/* Outside the wrapper above, so it sits over modals as well. */}
        <BusyBar />
        </ThemeProvider>
      </body>
    </html>
  );
}
