import { db } from "@/lib/db";
import { isGoogleConfigured, listCalendars } from "@/lib/google";
import { Card, Eyebrow } from "@/components/ui";
import { GooglePanel } from "@/components/GooglePanel";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { tone: "ok" | "bad"; text: string }> = {
  connected: { tone: "ok", text: "Connected to Google Calendar." },
  denied: { tone: "bad", text: "You declined the permission request." },
  unconfigured: { tone: "bad", text: "No Google credentials in .env yet — see the setup steps below." },
  missing_code: { tone: "bad", text: "Google didn't send an authorisation code. Try again." },
  bad_state: { tone: "bad", text: "Security check failed (state mismatch). Try again." },
  no_refresh_token: { tone: "bad", text: "Google didn't issue a refresh token. Revoke the app's access in your Google account and reconnect." },
  exchange_failed: { tone: "bad", text: "Couldn't exchange the code for a token. Check the client secret and redirect URI." },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const { google } = await searchParams;
  const auth = await db.googleAuth.findUnique({ where: { id: "singleton" } });
  const configured = isGoogleConfigured();
  const calendars = auth ? await listCalendars() : [];
  const linked = await db.task.count({ where: { calendarEventId: { not: null } } });

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Configuration</Eyebrow>
        <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">
          Settings
        </h1>
      </div>

      {google && MESSAGES[google] && (
        <div
          className={`animate-fade-in rounded-md border px-3.5 py-2.5 text-[13px] font-medium ${
            MESSAGES[google].tone === "ok"
              ? "border-[#cfdcca] bg-ok-soft text-[#3f5c38]"
              : "border-[#e6c6cf] bg-danger-soft text-[#7a3245]"
          }`}
        >
          {MESSAGES[google].text}
        </div>
      )}

      <GooglePanel
        configured={configured}
        connected={!!auth}
        email={auth?.email ?? null}
        calendarId={auth?.calendarId ?? "primary"}
        calendars={calendars.map((c) => ({ id: c.id, summary: c.summary, primary: !!c.primary }))}
        linkedCount={linked}
      />

      <Card className="p-5">
        <Eyebrow className="mb-3">Semester 2</Eyebrow>
        <p className="text-[13px] leading-6 text-n-600">
          Advanced Systems Programming, Advanced Networked Systems and SPRE are seeded
          and waiting, but stay hidden from every page until{" "}
          <strong className="text-n-800">1 January 2027</strong> so they don&apos;t clutter
          semester 1. Coaching Software Teams is marked as running all year, so it stays
          visible throughout.
        </p>
        <p className="mt-2 text-[11.5px] leading-5 text-n-400">
          Add their codes, timetables and deadlines in{" "}
          <code className="rounded bg-n-50 px-1 py-0.5 font-num text-[11px]">prisma/seed.ts</code>{" "}
          and run <code className="rounded bg-n-50 px-1 py-0.5 font-num text-[11px]">npm run seed</code>{" "}
          when they&apos;re published. The reveal date lives in{" "}
          <code className="rounded bg-n-50 px-1 py-0.5 font-num text-[11px]">lib/types.ts</code>.
        </p>
      </Card>
    </div>
  );
}
