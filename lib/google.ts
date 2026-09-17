import { db } from "./db";

/**
 * Google Calendar integration.
 *
 * Hand-rolled against the REST API rather than pulling in googleapis — we need
 * three endpoints, and that package is enormous.
 *
 * Tokens live in the database (GoogleAuth, a singleton) so they survive
 * restarts. Access tokens are refreshed automatically when they expire.
 *
 * Setup is in README.md → "Google Calendar". Without credentials in .env the
 * whole feature stays dormant and the UI says so, rather than erroring.
 */

const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
].join(" ");

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/google/callback";
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleConfigured(): boolean {
  const { clientId, clientSecret } = googleConfig();
  return !!clientId && !!clientSecret;
}

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = googleConfig();
  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    // offline + consent guarantees a refresh token, including on re-consent.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${OAUTH_AUTH}?${params}`;
}

export async function exchangeCode(code: string) {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId!,
      client_secret: clientSecret!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    id_token?: string;
  };
}

/** A valid access token, refreshed if the stored one has expired. */
export async function getAccessToken(): Promise<string | null> {
  const auth = await db.googleAuth.findUnique({ where: { id: "singleton" } });
  if (!auth) return null;

  // 60s of slack, so a token doesn't expire mid-request.
  if (auth.expiresAt.getTime() - 60_000 > Date.now()) return auth.accessToken;

  const { clientId, clientSecret } = googleConfig();
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: auth.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    // Refresh token revoked or expired — drop it so the UI prompts a reconnect
    // rather than failing silently on every future request.
    await db.googleAuth.deleteMany({ where: { id: "singleton" } });
    return null;
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  await db.googleAuth.update({
    where: { id: "singleton" },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });
  return data.access_token;
}

export type CalendarEventInput = {
  summary: string;
  description?: string;
  /** All-day when no time is known; otherwise a 1-hour slot ending at the deadline. */
  start: Date;
  end: Date;
  allDay: boolean;
};

/** Create or update the event for a task. Returns the Google event id. */
export async function upsertEvent(
  input: CalendarEventInput,
  existingEventId: string | null,
): Promise<{ ok: true; eventId: string; htmlLink: string } | { ok: false; error: string }> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: "Not connected to Google Calendar." };

  const auth = await db.googleAuth.findUnique({ where: { id: "singleton" } });
  const calendarId = encodeURIComponent(auth?.calendarId ?? "primary");

  const body = {
    summary: input.summary,
    description: input.description,
    start: input.allDay
      ? { date: isoDate(input.start) }
      : { dateTime: input.start.toISOString(), timeZone: tz() },
    end: input.allDay
      ? { date: isoDate(addDay(input.end)) } // Google treats all-day end as exclusive
      : { dateTime: input.end.toISOString(), timeZone: tz() },
    source: { title: "Study Planner", url: "http://localhost:3000" },
  };

  const url = existingEventId
    ? `${CALENDAR_API}/calendars/${calendarId}/events/${existingEventId}`
    : `${CALENDAR_API}/calendars/${calendarId}/events`;

  const res = await fetch(url, {
    method: existingEventId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // The event was deleted in Google — create a fresh one instead of failing.
  if (res.status === 404 && existingEventId) return upsertEvent(input, null);

  if (!res.ok) return { ok: false, error: `Google refused: ${res.status} ${await res.text()}` };

  const data = (await res.json()) as { id: string; htmlLink: string };
  return { ok: true, eventId: data.id, htmlLink: data.htmlLink };
}

export async function deleteEvent(eventId: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;
  const auth = await db.googleAuth.findUnique({ where: { id: "singleton" } });
  const calendarId = encodeURIComponent(auth?.calendarId ?? "primary");
  const res = await fetch(`${CALENDAR_API}/calendars/${calendarId}/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok || res.status === 410; // 410 = already gone
}

export async function listCalendars() {
  const token = await getAccessToken();
  if (!token) return [];
  const res = await fetch(`${CALENDAR_API}/users/me/calendarList?minAccessRole=writer`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    items: { id: string; summary: string; primary?: boolean }[];
  };
  return data.items ?? [];
}

function tz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
}

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDay(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + 1);
  return x;
}
