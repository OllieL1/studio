import { db } from "@/lib/db";
import { SPOTIFY_REDIRECT_URI } from "@/lib/origin";
import { isGoogleConfigured, listCalendars } from "@/lib/google";
import { Card, Eyebrow } from "@/components/ui";
import { GooglePanel } from "@/components/GooglePanel";
import { SpotifyPanel } from "@/components/SpotifyPanel";
import { BackupPanel } from "@/components/BackupPanel";
import { ThemePanel } from "@/components/ThemePanel";
import { getPreferences } from "@/lib/preferences";
import { backupDir, readBackupMeta } from "@/lib/backup";
import { hasHistoryScope, isSpotifyConfigured } from "@/lib/spotify";
import { GitHubPanel } from "@/components/GitHubPanel";
import { githubToken } from "@/lib/github";
import { projectRepo } from "@/lib/githubData";
import { EnhancementsPanel } from "@/components/EnhancementsPanel";
import { listEnhancements } from "@/app/enhancementActions";
import { PushcutPanel } from "@/components/PushcutPanel";
import { maskPushcutUrl } from "@/lib/pushcutUrl";
import type { SettingsSlug } from "@/lib/settingsSections";

type Message = { tone: "ok" | "bad"; text: string };

const GOOGLE_MESSAGES: Record<string, Message> = {
  connected: { tone: "ok", text: "Connected to Google Calendar." },
  denied: { tone: "bad", text: "You declined the permission request." },
  unconfigured: { tone: "bad", text: "No Google credentials in .env yet - see the setup steps below." },
  missing_code: { tone: "bad", text: "Google didn't send an authorisation code. Try again." },
  bad_state: { tone: "bad", text: "Security check failed (state mismatch). Try again." },
  no_refresh_token: { tone: "bad", text: "Google didn't issue a refresh token. Revoke the app's access in your Google account and reconnect." },
  exchange_failed: { tone: "bad", text: "Couldn't exchange the code for a token. Check the client secret and redirect URI." },
};

const SPOTIFY_MESSAGES: Record<string, Message> = {
  connected: { tone: "ok", text: "Connected to Spotify." },
  denied: { tone: "bad", text: "You declined Spotify's permission request." },
  unconfigured: { tone: "bad", text: "No Spotify credentials in .env yet - see the setup steps below." },
  missing_code: { tone: "bad", text: "Spotify didn't send an authorisation code. Try again." },
  bad_state: { tone: "bad", text: "Spotify security check failed (state mismatch). Try connecting again." },
  exchange_failed: { tone: "bad", text: `Couldn't finish connecting to Spotify. Check the client secret and that the redirect URI is exactly ${SPOTIFY_REDIRECT_URI}.` },
};

/** What an OAuth round trip came back with, above the panel it was for. */
function Banner({ message }: { message?: Message }) {
  if (!message) return null;
  return (
    <div
      className={`animate-fade-in rounded-md border px-3.5 py-2.5 text-[13px] font-medium ${
        message.tone === "ok"
          ? "border-[#cfdcca] bg-ok-soft text-[#3f5c38]"
          : "border-[#e6c6cf] bg-danger-soft text-[#7a3245]"
      }`}
    >
      {message.text}
    </div>
  );
}

export type SectionParams = { google?: string; spotify?: string };

/**
 * One section of Settings, with only the data it needs. The OAuth flows
 * return to their own section with `?google=` / `?spotify=` saying how it went.
 */
export async function SettingsSectionView({ slug, params }: { slug: SettingsSlug; params: SectionParams }) {
  switch (slug) {
    case "appearance": {
      const prefs = await getPreferences();
      return (
        <Card className="p-5">
          <Eyebrow className="mb-3">Appearance</Eyebrow>
          <ThemePanel darkFrom={prefs.darkFrom} darkTo={prefs.darkTo} />
        </Card>
      );
    }

    case "github": {
      const [ghAuth, ghToken, ghProject, repos] = await Promise.all([
        db.gitHubAuth.findUnique({ where: { id: "singleton" }, select: { login: true, name: true, scopes: true } }),
        githubToken(),
        projectRepo(),
        db.repo.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, label: true, fullName: true } }),
      ]);
      return (
        <GitHubPanel
          source={ghToken?.source ?? null}
          login={ghAuth?.login ?? null}
          name={ghAuth?.name ?? null}
          scopes={ghAuth?.scopes ?? null}
          projectRepo={ghProject}
          repos={repos}
        />
      );
    }

    case "google": {
      const auth = await db.googleAuth.findUnique({ where: { id: "singleton" } });
      const [calendars, linked] = await Promise.all([
        auth ? listCalendars() : Promise.resolve([]),
        db.task.count({ where: { calendarEventId: { not: null } } }),
      ]);
      return (
        <>
          <Banner message={params.google ? GOOGLE_MESSAGES[params.google] : undefined} />
          <GooglePanel
            configured={isGoogleConfigured()}
            connected={!!auth}
            email={auth?.email ?? null}
            calendarId={auth?.calendarId ?? "primary"}
            planCalendarId={auth?.planCalendarId ?? null}
            calendars={calendars.map((c) => ({ id: c.id, summary: c.summary, primary: !!c.primary }))}
            linkedCount={linked}
          />
        </>
      );
    }

    case "spotify": {
      const spotifyAuth = await db.spotifyAuth.findUnique({ where: { id: "singleton" } });
      return (
        <>
          <Banner message={params.spotify ? SPOTIFY_MESSAGES[params.spotify] : undefined} />
          <SpotifyPanel
            configured={isSpotifyConfigured()}
            connected={!!spotifyAuth}
            displayName={spotifyAuth?.displayName ?? null}
            historyScope={spotifyAuth ? await hasHistoryScope() : false}
          />
        </>
      );
    }

    case "pushcut": {
      const pushcut = await db.preference
        .findUnique({ where: { id: "singleton" }, select: { pushcutOn: true, pushcutStartUrl: true, pushcutEndUrl: true } })
        .catch(() => null);
      return (
        <PushcutPanel
          on={pushcut?.pushcutOn ?? false}
          startMasked={maskPushcutUrl(pushcut?.pushcutStartUrl)}
          endMasked={maskPushcutUrl(pushcut?.pushcutEndUrl)}
        />
      );
    }

    case "backup": {
      const m = readBackupMeta();
      return (
        <BackupPanel
          live={!!process.env.STUDIO_LIVE}
          dir={backupDir()}
          last={m ? { at: m.at, sessions: m.sessions, bytes: m.bytes } : null}
        />
      );
    }

    case "enhancements":
      return <EnhancementsPanel rows={await listEnhancements()} />;

    case "semester":
      return (
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
      );
  }
}
