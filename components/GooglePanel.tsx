"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectGoogle, setCalendarTarget } from "@/app/actions";
import { setPlanCalendar } from "@/app/planActions";
import { Card, Eyebrow } from "./ui";
import { clsx } from "@/lib/clsx";
import { GOOGLE_REDIRECT_URI, LOOPBACK_ORIGIN } from "@/lib/origin";

/** Google Calendar connection state and setup instructions. */
export function GooglePanel({
  configured,
  connected,
  email,
  calendarId,
  planCalendarId,
  calendars,
  linkedCount,
  returnTo = "/settings",
}: {
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendarId: string;
  /** Where the weekly schedule's blocks go; null until one is chosen or found. */
  planCalendarId: string | null;
  calendars: { id: string; summary: string; primary: boolean }[];
  linkedCount: number;
  /** Where Google's sign-in comes back to. */
  returnTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showSteps, setShowSteps] = useState(!configured);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Google Calendar</Eyebrow>
          <p className="mt-1.5 flex items-center gap-2 text-[14px] font-semibold text-n-800">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{
                background: connected
                  ? "var(--color-ok)"
                  : configured
                    ? "var(--color-warn)"
                    : "var(--color-n-300)",
              }}
            />
            {connected ? "Connected" : configured ? "Ready to connect" : "Not set up"}
          </p>
          <p className="mt-0.5 text-[12px] text-n-500">
            {connected
              ? `${email ?? "Signed in"} · ${linkedCount} task${linkedCount === 1 ? "" : "s"} on your calendar`
              : configured
                ? "Credentials found. Connect to start pushing deadlines across."
                : "Add Google credentials to .env to enable one-click calendar sync."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {connected ? (
            <button
              onClick={() => {
                if (!confirm("Disconnect Google Calendar? Events already created stay in your calendar.")) return;
                startTransition(async () => {
                  await disconnectGoogle();
                  router.refresh();
                });
              }}
              disabled={pending}
              className="rounded-md border border-n-200 px-3 py-2 text-[12.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50"
            >
              Disconnect
            </button>
          ) : (
            // Started on the loopback origin, not wherever the page is: Google
            // redirects back to localhost, and the state cookie has to be set
            // on the host it returns to - from studio.localhost it wasn't.
            <a
              href={`${LOOPBACK_ORIGIN}/api/google/auth?return=${encodeURIComponent(returnTo)}`}
              className={clsx(
                "rounded-md px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-[120ms]",
                configured ? "bg-rust-500 hover:bg-rust-600" : "pointer-events-none bg-n-300",
              )}
            >
              Connect Google
            </a>
          )}
        </div>
      </div>

      {connected && calendars.length > 0 && (
        <div className="mt-4 space-y-4 border-t border-n-100 pt-4">
          <CalendarPicker
            label="Write events to"
            calendars={calendars}
            selected={calendarId}
            disabled={pending}
            onPick={(id) => startTransition(async () => { await setCalendarTarget(id); router.refresh(); })}
          />
          <CalendarPicker
            label="Weekly schedule syncs to"
            hint={planCalendarId ? undefined : "Make a calendar called “Studio” in Google and it's picked automatically - or choose one here."}
            calendars={calendars}
            selected={planCalendarId}
            disabled={pending}
            onPick={(id) => startTransition(async () => { await setPlanCalendar(id); router.refresh(); })}
          />
        </div>
      )}

      <div className="mt-4 border-t border-n-100 pt-3">
        <button
          onClick={() => setShowSteps((v) => !v)}
          aria-expanded={showSteps}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-[12px] font-semibold text-n-600">
            One-time setup {configured && "(done)"}
          </span>
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            className={clsx("text-n-400 transition-transform duration-[180ms]", showSteps && "rotate-180")}
          >
            <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {showSteps && (
          <ol className="animate-fade-in mt-3 space-y-2.5 text-[12.5px] leading-5 text-n-600">
            {[
              <>Go to <ExtLink href="https://console.cloud.google.com/projectcreate">console.cloud.google.com</ExtLink> and create a project (any name).</>,
              <>Under <b>APIs &amp; Services → Library</b>, search for <b>Google Calendar API</b> and enable it.</>,
              <>Under <b>OAuth consent screen</b>, choose <b>External</b>, fill in the app name and your email, and add yourself under <b>Test users</b>. It can stay in Testing mode - it&apos;s only ever you.</>,
              <>Under <b>Credentials → Create credentials → OAuth client ID</b>, pick <b>Web application</b> and add this exact <b>Authorised redirect URI</b>:
                <code className="mt-1 block rounded bg-n-50 px-2 py-1.5 font-num text-[11.5px] text-n-700">{GOOGLE_REDIRECT_URI}</code></>,
              <>Copy the client ID and secret into <code className="rounded bg-n-50 px-1 py-0.5 font-num text-[11px]">.env</code>:
                <code className="mt-1 block whitespace-pre rounded bg-n-50 px-2 py-1.5 font-num text-[11.5px] leading-5 text-n-700">{`GOOGLE_CLIENT_ID="…apps.googleusercontent.com"\nGOOGLE_CLIENT_SECRET="…"`}</code></>,
              <>Restart <code className="rounded bg-n-50 px-1 py-0.5 font-num text-[11px]">npm run dev</code>, then hit <b>Connect Google</b> above.</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="font-num mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-n-100 text-[10.5px] font-semibold text-n-600">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

function CalendarPicker({
  label, hint, calendars, selected, disabled, onPick,
}: {
  label: string;
  hint?: string;
  calendars: { id: string; summary: string; primary: boolean }[];
  selected: string | null;
  disabled: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div>
      <Eyebrow className="mb-2">{label}</Eyebrow>
      <div className="flex flex-wrap gap-1.5">
        {calendars.map((c) => {
          const on = c.id === selected;
          return (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              disabled={disabled}
              aria-pressed={on}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-all duration-[180ms]",
                on ? "border-transparent bg-rust-500 text-white" : "border-n-200 text-n-600 hover:bg-n-50",
              )}
            >
              {c.summary}
              {c.primary && <span className="ml-1 opacity-60">· default</span>}
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-1.5 text-[11.5px] text-n-500">{hint}</p>}
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="font-medium text-rust-600 underline underline-offset-2 hover:text-rust-700"
    >
      {children}
    </a>
  );
}
