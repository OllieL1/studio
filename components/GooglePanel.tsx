"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectGoogle, setCalendarTarget } from "@/app/actions";
import { Card, Eyebrow } from "./ui";
import { clsx } from "@/lib/clsx";
import { GOOGLE_REDIRECT_URI } from "@/lib/origin";

/** Google Calendar connection state and setup instructions. */
export function GooglePanel({
  configured,
  connected,
  email,
  calendarId,
  calendars,
  linkedCount,
}: {
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendarId: string;
  calendars: { id: string; summary: string; primary: boolean }[];
  linkedCount: number;
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
            <a
              href="/api/google/auth"
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
        <div className="mt-4 border-t border-n-100 pt-4">
          <Eyebrow className="mb-2">Write events to</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {calendars.map((c) => {
              const on = c.id === calendarId;
              return (
                <button
                  key={c.id}
                  onClick={() =>
                    startTransition(async () => {
                      await setCalendarTarget(c.id);
                      router.refresh();
                    })
                  }
                  aria-pressed={on}
                  className={clsx(
                    "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-all duration-[180ms]",
                    on
                      ? "border-transparent bg-rust-500 text-white"
                      : "border-n-200 text-n-600 hover:bg-n-50",
                  )}
                >
                  {c.summary}
                  {c.primary && <span className="ml-1 opacity-60">· default</span>}
                </button>
              );
            })}
          </div>
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
