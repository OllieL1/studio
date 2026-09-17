import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { TimerBar } from "@/components/TimerBar";
import { CommandPalette } from "@/components/CommandPalette";
import { getActiveTimer } from "@/lib/queries";
import { db } from "@/lib/db";
import { visibleCourseWhere } from "@/lib/types";

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

export const metadata: Metadata = {
  title: "Study Planner — 26/27",
  description: "Fifth year time management portal",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The timer and course list live in the shell, so they're fetched once here
  // rather than by every page.
  const [timer, courses] = await Promise.all([
    getActiveTimer(),
    db.course.findMany({
      where: visibleCourseWhere(),
      orderBy: { position: "asc" },
      select: { id: true, name: true, shortName: true, colour: true, code: true },
    }),
  ]);

  return (
    <html lang="en-GB" className={`${inter.variable} ${fraunces.variable} ${mono.variable}`}>
      <body>
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
          />
        </div>
      </body>
    </html>
  );
}
