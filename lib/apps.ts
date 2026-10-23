import { HOST_ALIAS, LIVIO_HOST_ALIAS } from "./origin";

/**
 * Studio and Livio: two sites served by one process.
 *
 * Livio's pages live under /livio, which always works. livio.localhost is an
 * optional front door (proxy.ts sends its `/` to /livio) - used only when
 * this machine resolves it, which Safari needs an /etc/hosts line for. That
 * front door is why a cross-app link can't always be a path: `/` on
 * livio.localhost is Livio's home, not Studio's.
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

/**
 * Which friendly names this machine actually resolves. Chrome resolves any
 * *.localhost by itself, but Safari only knows what /etc/hosts lists - so a
 * name is only used once the server (on the same machine, reading the same
 * hosts file) has found it. See lib/aliases.ts.
 */
export type Aliases = { studio: boolean; livio: boolean };

export const NO_ALIASES: Aliases = { studio: false, livio: false };

/**
 * A link to `path` in `app`, from wherever the browser currently is.
 *
 * Stay on the current host where that works - Livio is always at /livio. The
 * one place it can't: Studio from livio.localhost, where `/` is Livio's home,
 * so that goes to studio.localhost if it resolves, or plain localhost.
 * Livio's own name is only used when it resolves.
 */
export function crossAppHref(app: App, path: string, here: Here, aliases: Aliases = NO_ALIASES): string {
  const origin = (host: string) => `${here.protocol}//${host}${here.port ? `:${here.port}` : ""}`;
  if (here.hostname === LIVIO_HOST_ALIAS) {
    if (app === "livio") return path;
    return `${origin(aliases.studio ? HOST_ALIAS : "localhost")}${path}`;
  }
  if (app === "livio" && here.hostname === HOST_ALIAS && aliases.livio) {
    // livio.localhost's `/` already is Livio's home; keep the URL tidy.
    return `${origin(LIVIO_HOST_ALIAS)}${path === LIVIO_BASE ? "/" : path}`;
  }
  return path;
}

/** The other app's counterpart to this page, as a link. */
export function switchHref(pathname: string, here: Here, aliases: Aliases = NO_ALIASES): string {
  const target: App = appOf(pathname) === "studio" ? "livio" : "studio";
  return crossAppHref(target, counterpartPath(pathname), here, aliases);
}
