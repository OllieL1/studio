import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { TimerBar } from "@/components/TimerBar";
import { CommandPalette } from "@/components/CommandPalette";
import { getActiveTimer } from "@/lib/queries";
import { db } from "@/lib/db";
import { isStudyLocation, visibleCourseWhere } from "@/lib/types";
import { getPreferences } from "@/lib/preferences";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

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
  const [prefs, timer, courses, lastSession] = await Promise.all([
    getPreferences(),
    getActiveTimer(),
    db.course.findMany({
      where: visibleCourseWhere(),
      orderBy: { position: "asc" },
      select: { id: true, name: true, shortName: true, colour: true, code: true, isProject: true },
    }),
    // The stop dialog pre-selects wherever the last session was.
    db.session.findFirst({
      where: { location: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { location: true, locationNote: true },
    }),
  ]);

  return (
    // The theme is decided here, on the server, so the first paint is already
    // the right one. A client-side toggle would flash the light page first.
    <html
      lang="en-GB"
      data-theme={prefs.theme}
      className={`${inter.variable} ${fraunces.variable} ${mono.variable}`}
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
          <Nav courses={courses} />
          <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 pb-32 pt-8 sm:px-8">
            {children}
          </main>
          <CommandPalette />
          <TimerBar
            startedAt={timer?.startedAt.toISOString() ?? null}
            draftName={timer?.draftName ?? null}
            courses={courses}
            lastLocation={isStudyLocation(lastSession?.location) ? lastSession.location : null}
            lastLocationNote={lastSession?.locationNote ?? null}
          />
        </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
