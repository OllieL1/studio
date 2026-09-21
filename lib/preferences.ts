import { cache } from "react";
import { db } from "./db";
import {
  cleanHour, isThemeMode, resolveTheme, DEFAULT_DARK_FROM, DEFAULT_DARK_TO,
  type Theme, type ThemeMode,
} from "./theme";

/**
 * App preferences, read once per request.
 *
 * The theme is resolved on the server so the very first byte of HTML already
 * carries it - that's what stops the white flash a client-side toggle gives
 * you. `cache` keeps the layout and any page that asks to one query.
 */

export type Preferences = {
  mode: ThemeMode;
  darkFrom: number;
  darkTo: number;
  theme: Theme;
};

export const getPreferences = cache(async (now: Date = new Date()): Promise<Preferences> => {
  let row: { theme: string; darkFrom: number; darkTo: number } | null = null;
  try {
    row = await db.preference.findUnique({
      where: { id: "singleton" },
      select: { theme: true, darkFrom: true, darkTo: true },
    });
  } catch {
    // A missing table (an old database, mid-migration) shouldn't blank the app.
    row = null;
  }

  const mode = isThemeMode(row?.theme) ? row.theme : "auto";
  const darkFrom = cleanHour(row?.darkFrom ?? DEFAULT_DARK_FROM, DEFAULT_DARK_FROM);
  const darkTo = cleanHour(row?.darkTo ?? DEFAULT_DARK_TO, DEFAULT_DARK_TO);

  return { mode, darkFrom, darkTo, theme: resolveTheme(mode, now, darkFrom, darkTo) };
});

/** Just the resolved theme - for server components that tint a colour. */
export async function currentTheme(): Promise<Theme> {
  return (await getPreferences()).theme;
}
