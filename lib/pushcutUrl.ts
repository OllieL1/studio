/**
 * Pushcut links, the pure part - no database, so the settings panel (a client
 * component) can use it too.
 *
 * Only Pushcut's own API host is accepted: the saved link is fetched by the
 * server on every session start and stop, so it must not be pointable at
 * anything else.
 */

export const PUSHCUT_HOST = "api.pushcut.io";

/** An https Pushcut link that runs a Shortcut: .../<secret>/execute?shortcut=...
 *  or a notification: .../<secret>/notifications/<name>. */
export function isPushcutUrl(input: string): boolean {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return false;
  }
  return (
    u.protocol === "https:" &&
    u.hostname === PUSHCUT_HOST &&
    !u.username &&
    !u.password &&
    /^\/[^/]+\/(execute|notifications\/[^/]+)\/?$/.test(u.pathname)
  );
}

/** The link with its secret hidden, to show back what is saved. */
export function maskPushcutUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input);
    const [, , ...rest] = u.pathname.split("/");
    return `${u.origin}/••••/${rest.join("/")}${u.search}`;
  } catch {
    return "••••";
  }
}
