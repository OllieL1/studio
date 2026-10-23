import type { Metadata } from "next";
import { db } from "@/lib/db";
import { isGoogleConfigured, listCalendars } from "@/lib/google";
import { getPreferences } from "@/lib/preferences";
import { Card, Eyebrow } from "@/components/ui";
import { ThemePanel } from "@/components/ThemePanel";
import { GooglePanel } from "@/components/GooglePanel";
import { NotionPanel } from "@/components/livio/NotionPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preferences" };

const GOOGLE_MESSAGES: Record<string, { tone: "ok" | "bad"; text: string }> = {
  connected: { tone: "ok", text: "Connected to Google Calendar." },
  denied: { tone: "bad", text: "You declined the permission request." },
  unconfigured: { tone: "bad", text: "No Google credentials in .env yet - see the setup steps below." },
  missing_code: { tone: "bad", text: "Google didn't send an authorisation code. Try again." },
  bad_state: { tone: "bad", text: "Security check failed (state mismatch). Try again." },
  no_refresh_token: { tone: "bad", text: "Google didn't issue a refresh token. Revoke the app's access in your Google account and reconnect." },
  exchange_failed: { tone: "bad", text: "Couldn't exchange the code for a token. Check the client secret and redirect URI." },
};

/**
 * Livio's preferences. Appearance and Google are Studio's own settings - the
 * same rows, shared by both apps - and Notion is Livio's. Spotify and GitHub
 * stay in Studio, where they're used.
 */
export default async function PreferencesPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  const [prefs, auth, notion, linked] = await Promise.all([
    getPreferences(),
    db.googleAuth.findUnique({ where: { id: "singleton" } }),
    db.notionAuth.findUnique({ where: { id: "singleton" }, select: { title: true } }),
    db.task.count({ where: { calendarEventId: { not: null } } }),
  ]);
  const calendars = auth ? await listCalendars() : [];
  const message = google ? GOOGLE_MESSAGES[google] : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Livio</Eyebrow>
        <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">Preferences</h1>
      </div>

      <Card className="p-5">
        <Eyebrow className="mb-3">Appearance</Eyebrow>
        <ThemePanel darkFrom={prefs.darkFrom} darkTo={prefs.darkTo} />
        <p className="mt-3 text-[11.5px] leading-5 text-n-400">Shared with Studio, so switching apps never changes the lights.</p>
      </Card>

      {message && (
        <div
          className={`animate-fade-in rounded-md px-3.5 py-2.5 text-[13px] font-medium ${
            message.tone === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"
          }`}
        >
          {message.text}
        </div>
      )}

      <GooglePanel
        configured={isGoogleConfigured()}
        connected={!!auth}
        email={auth?.email ?? null}
        calendarId={auth?.calendarId ?? "primary"}
        planCalendarId={auth?.planCalendarId ?? null}
        calendars={calendars.map((c) => ({ id: c.id, summary: c.summary, primary: !!c.primary }))}
        linkedCount={linked}
        returnTo="/livio/preferences"
      />

      <NotionPanel connected={!!notion} title={notion?.title ?? null} />
    </div>
  );
}
