/**
 * The sections of Settings, as the sidebar tree lists them.
 *
 * Each is its own page at /settings/<slug> (Appearance is also /settings
 * itself), so a section loads only what it shows - Google's calendar list is
 * a network call, and used to run on every visit to Settings whichever panel
 * you'd come for.
 */
export type SettingsSlug = "appearance" | "github" | "google" | "spotify" | "pushcut" | "backup" | "enhancements" | "semester";

export type SettingsSection = { slug: SettingsSlug; label: string };
export type SettingsGroup = { label: string | null; sections: SettingsSection[] };

export const SETTINGS_TREE: SettingsGroup[] = [
  { label: null, sections: [{ slug: "appearance", label: "Appearance" }] },
  {
    label: "Connectors",
    sections: [
      { slug: "github", label: "GitHub" },
      { slug: "google", label: "Google Calendar" },
      { slug: "spotify", label: "Spotify" },
      { slug: "pushcut", label: "Pushcut" },
    ],
  },
  { label: "Data", sections: [{ slug: "backup", label: "Backup" }] },
  {
    label: null,
    sections: [
      { slug: "enhancements", label: "Enhancements" },
      { slug: "semester", label: "Semester 2" },
    ],
  },
];

export const SETTINGS_SLUGS = SETTINGS_TREE.flatMap((g) => g.sections.map((s) => s.slug));

export const isSettingsSlug = (s: string): s is SettingsSlug => (SETTINGS_SLUGS as string[]).includes(s);

/**
 * Which section a path is showing: /settings is Appearance, the default.
 * Anything else under /settings that isn't a section shows none.
 */
export function sectionOf(pathname: string): SettingsSlug | null {
  if (pathname.replace(/\/+$/, "") === "/settings") return "appearance";
  const m = /^\/settings\/([^/]+)/.exec(pathname);
  return m && isSettingsSlug(m[1]) ? m[1] : null;
}
