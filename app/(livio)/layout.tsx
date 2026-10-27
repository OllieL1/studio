import type { Metadata, Viewport } from "next";
import "../globals.css";
import { fontVariables } from "../fonts";
import { getPreferences } from "@/lib/preferences";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LivioNav } from "@/components/livio/LivioNav";
import { NotionAutoPull } from "@/components/livio/NotionAutoPull";
import { DueSoonBanner } from "@/components/DueSoonBanner";
import { db } from "@/lib/db";

/**
 * Livio's root layout - its own site, served by the same process as Studio.
 *
 * `data-app="livio"` repoints the colour tokens to violet (globals.css), so
 * every shared component follows. The theme preference is Studio's: one
 * setting for both, so switching apps never flips light to dark.
 */

// Livio's page and dark canvas (--color-n-25), painted before the stylesheet.
const CANVAS = { light: "#fafafc", dark: "#121215" } as const;

export async function generateViewport(): Promise<Viewport> {
  const { theme } = await getPreferences();
  return { colorScheme: theme, themeColor: CANVAS[theme] };
}

export const metadata: Metadata = {
  title: { default: "Livio", template: "%s · Livio" },
  description: "Livio - everything outside the degree",
};

export default async function LivioLayout({ children }: { children: React.ReactNode }) {
  const [prefs, notion] = await Promise.all([
    getPreferences(),
    db.notionAuth.findUnique({ where: { id: "singleton" }, select: { id: true } }),
  ]);

  return (
    <html
      lang="en-GB"
      data-app="livio"
      data-theme={prefs.theme}
      className={fontVariables}
      style={{ background: CANVAS[prefs.theme] }}
    >
      <body>
        <ThemeProvider initial={prefs.theme} mode={prefs.mode} darkFrom={prefs.darkFrom} darkTo={prefs.darkTo}>
          <div className="relative z-10 flex min-h-screen flex-col">
            <LivioNav />
            {/* Studio's deadlines reach here too - a quiz in an hour matters wherever you are. */}
            <DueSoonBanner initial={null} />
            <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 pb-24 pt-8 sm:px-8">{children}</main>
            {notion && <NotionAutoPull />}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
