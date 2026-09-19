"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectSpotify } from "@/app/actions";
import { Card, Eyebrow } from "./ui";
import { clsx } from "@/lib/clsx";

/** Spotify connection state and one-time setup steps. */
export function SpotifyPanel({
  configured,
  connected,
  displayName,
  historyScope,
}: {
  configured: boolean;
  connected: boolean;
  displayName: string | null;
  /** Whether listening history was granted — connections before 18 Sep 2026 lack it. */
  historyScope: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showSteps, setShowSteps] = useState(!configured);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Spotify</Eyebrow>
          <p className="mt-1.5 flex items-center gap-2 text-[14px] font-semibold text-n-800">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{
                background: connected ? "var(--color-ok)" : configured ? "var(--color-warn)" : "var(--color-n-300)",
              }}
            />
            {connected ? "Connected" : configured ? "Ready to connect" : "Not set up"}
          </p>
          <p className="mt-0.5 text-[12px] text-n-500">
            {connected
              ? `${displayName ?? "Signed in"} · what you're playing shows beside the timer and is logged with each session`
              : "Shows what's playing beside the timer and logs it with each study session. Read-only - it can't control playback."}
          </p>
          {connected && !historyScope && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 rounded-sm bg-warn-soft px-2.5 py-1.5 text-[12px] text-[#7a5f16]">
              Reconnect to grant listening history, so music played while this app was closed is still captured.
              <a href="/api/spotify/auth" className="font-semibold underline underline-offset-2">Reconnect</a>
            </p>
          )}
        </div>

        {connected ? (
          <button
            onClick={() =>
              startTransition(async () => {
                await disconnectSpotify();
                router.refresh();
              })
            }
            disabled={pending}
            className="rounded-md border border-n-200 px-3 py-2 text-[12.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50"
          >
            Disconnect
          </button>
        ) : (
          <a
            href="/api/spotify/auth"
            className={clsx(
              "rounded-md px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-[120ms]",
              configured ? "bg-rust-500 hover:bg-rust-600" : "pointer-events-none bg-n-300",
            )}
          >
            Connect Spotify
          </a>
        )}
      </div>

      <div className="mt-4 border-t border-n-100 pt-3">
        <button
          onClick={() => setShowSteps((v) => !v)}
          aria-expanded={showSteps}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-[12px] font-semibold text-n-600">One-time setup {configured && "(done)"}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={clsx("text-n-400 transition-transform duration-[180ms]", showSteps && "rotate-180")}>
            <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {showSteps && (
          <ol className="animate-fade-in mt-3 space-y-2.5 text-[12.5px] leading-5 text-n-600">
            {[
              <>Go to the <ExtLink href="https://developer.spotify.com/dashboard">Spotify Developer Dashboard</ExtLink> and <b>Create app</b> (any name and description).</>,
              <>Under <b>Redirect URIs</b>, add exactly this - Spotify rejects <code className="font-num text-[11px]">localhost</code>, so it has to be the IP:
                <code className="mt-1 block rounded bg-n-50 px-2 py-1.5 font-num text-[11.5px] text-n-700">http://127.0.0.1:3000/api/spotify/callback</code></>,
              <>Tick <b>Web API</b> under the APIs used, and save.</>,
              <>Open the app&apos;s <b>Settings</b>, copy the client ID and secret into <code className="rounded bg-n-50 px-1 py-0.5 font-num text-[11px]">.env</code>:
                <code className="mt-1 block whitespace-pre rounded bg-n-50 px-2 py-1.5 font-num text-[11.5px] leading-5 text-n-700">{`SPOTIFY_CLIENT_ID="…"\nSPOTIFY_CLIENT_SECRET="…"`}</code></>,
              <>Restart <code className="rounded bg-n-50 px-1 py-0.5 font-num text-[11px]">npm run dev</code>, then hit <b>Connect Spotify</b>. You&apos;ll briefly land on <code className="font-num text-[11px]">127.0.0.1</code> for the sign-in, then come back here.</>,
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
    <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium text-rust-600 underline underline-offset-2 hover:text-rust-700">
      {children}
    </a>
  );
}
