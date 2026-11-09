import { db } from "./db";
import { isPushcutUrl } from "./pushcutUrl";

/**
 * Phone Focus mode. When a session starts or resumes Studio calls one Pushcut
 * link, and when it ends or pauses another; each runs an iOS Shortcut that
 * turns a Focus on or off (Pushcut's Automation Server must be running on the
 * phone). Everything here is best-effort: it never throws, so a phone that is
 * off or a network that is down can never get in the way of a session.
 */

export type PushcutEvent = "start" | "end";
export type PushcutResult = { ok: true } | { ok: false; error: string };

// Pushcut holds an execute call until the phone answers, and gives up itself
// after ~10s, so wait a little longer than that to hear why. Nothing waits on
// this: every caller runs it after the response.
const TIMEOUT_MS = 15000;

async function call(url: string, method: "GET" | "POST") {
  return fetch(url, {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "Studio/1.0 (personal study planner)" },
  });
}

/** Send one event. `force` is the Test buttons: they work with the switch off. */
export async function firePushcut(event: PushcutEvent, opts: { force?: boolean } = {}): Promise<PushcutResult> {
  try {
    const row = await db.preference.findUnique({
      where: { id: "singleton" },
      select: { pushcutOn: true, pushcutStartUrl: true, pushcutEndUrl: true },
    });
    if (!row || (!row.pushcutOn && !opts.force)) return { ok: false, error: "Phone Focus is off." };
    const url = event === "start" ? row.pushcutStartUrl : row.pushcutEndUrl;
    if (!url) return { ok: false, error: `No ${event === "start" ? "start" : "end"} link saved.` };
    if (!isPushcutUrl(url)) return { ok: false, error: "That isn't a Pushcut link." };

    let res = await call(url, "GET");
    // Some Pushcut endpoints only take POST.
    if (res.status === 405) res = await call(url, "POST");
    if (res.ok) return { ok: true };
    // Pushcut explains itself in JSON, e.g. {"error":"iOS device did not respond in time."}
    const why = await res.json().then((j: { error?: unknown }) => (typeof j.error === "string" ? j.error : null)).catch(() => null);
    return { ok: false, error: why ? `Pushcut: ${why}` : `Pushcut answered ${res.status}.` };
  } catch {
    return { ok: false, error: "Couldn't reach Pushcut - offline, or it took too long." };
  }
}
