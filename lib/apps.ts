import { HOST_ALIAS, LIVIO_HOST_ALIAS } from "./origin";

/**
 * Studio and Livio: two sites served by one process.
 *
 * Livio's pages live under /livio, which always works. On the friendly names
 * the two apps sit on their own hosts instead (studio.localhost and
 * livio.localhost), and proxy.ts sends livio.localhost's `/` to /livio. That
 * front door is why a cross-app link can't just be a path: `/` on
 * livio.localhost is Livio's home, not Studio's. So when you're on an alias,
 * the other app's alias is used; on plain localhost, the path alone is.
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

type Here = { protocol: string; hostname: string; port: string };

/** A link to `path` in `app`, from wherever the browser currently is. */
export function crossAppHref(app: App, path: string, here: Here): string {
  const onAlias = here.hostname === HOST_ALIAS || here.hostname === LIVIO_HOST_ALIAS;
  if (!onAlias) return path;

  const host = app === "livio" ? LIVIO_HOST_ALIAS : HOST_ALIAS;
  // livio.localhost's `/` already is Livio's home; keep the URL tidy.
  const tidy = app === "livio" && path === LIVIO_BASE ? "/" : path;
  return `${here.protocol}//${host}${here.port ? `:${here.port}` : ""}${tidy}`;
}

/** The other app's counterpart to this page, as a link. */
export function switchHref(pathname: string, here: Here): string {
  const target: App = appOf(pathname) === "studio" ? "livio" : "studio";
  return crossAppHref(target, counterpartPath(pathname), here);
}
