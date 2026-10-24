/**
 * Studio and Livio: two sites served by one process.
 *
 * Livio's pages live under /livio, which always works. livio.localhost is an
 * optional front door (proxy.ts sends its `/` to /livio) for machines that
 * resolve it; Safari needs an /etc/hosts line for that.
 *
 * Pure, so the nav, the switch shortcut and tests can all share it.
 */

export type App = "studio" | "livio";

export const LIVIO_BASE = "/livio";

export const APP_NAME: Record<App, string> = { studio: "Studio", livio: "Livio" };

export function appOf(pathname: string): App {
  return pathname === LIVIO_BASE || pathname.startsWith(`${LIVIO_BASE}/`) ? "livio" : "studio";
}

/** Pages that mean the same thing in both apps. Anything else lands on the
 *  other app's home, since there's no counterpart to keep your place in. */
const PAIRS: [studio: string, livio: string][] = [
  ["/", LIVIO_BASE],
  ["/settings", `${LIVIO_BASE}/preferences`],
];

/** Where the switch should take you from this page. */
export function counterpartPath(pathname: string): string {
  const from = appOf(pathname);
  const pair = PAIRS.find(([s, l]) => (from === "studio" ? s : l) === pathname);
  if (pair) return from === "studio" ? pair[1] : pair[0];
  return from === "studio" ? LIVIO_BASE : "/";
}

/**
 * A link to `path` in `app`. Always a path on the current host - never a
 * different host, which is what used to break: Safari can't resolve
 * *.localhost names without an /etc/hosts line, and a guess about which
 * names resolve sent the switch to the wrong place.
 *
 * The one catch: on livio.localhost a bare `/` is Livio's home, so Studio's
 * home is `/?studio` there (proxy.ts leaves that alone). It's harmless on
 * every other host, so it isn't conditional.
 */
export const STUDIO_HOME_ON_LIVIO_HOST = "/?studio";

export function crossAppHref(app: App, path: string): string {
  return app === "studio" && path === "/" ? STUDIO_HOME_ON_LIVIO_HOST : path;
}

/** The other app's counterpart to this page, as a link. */
export function switchHref(pathname: string): string {
  const target: App = appOf(pathname) === "studio" ? "livio" : "studio";
  return crossAppHref(target, counterpartPath(pathname));
}
