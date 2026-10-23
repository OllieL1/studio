"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectNotion, disconnectNotion } from "@/app/livioActions";
import { Card, Eyebrow } from "../ui";

/**
 * Livio's Notion connection: an internal-integration secret and the To-do
 * database link. Nothing's saved until Notion confirms both, so a bad paste
 * is explained here rather than failing quietly on the first pull.
 */
export function NotionPanel({ connected, title }: { connected: boolean; title: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [secret, setSecret] = useState("");
  const [database, setDatabase] = useState("");
  const [error, setError] = useState<{ text: string; problems?: string[] } | null>(null);

  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await connectNotion(secret, database);
      if (res.ok) {
        setSecret("");
        setDatabase("");
        router.refresh();
      } else {
        setError({ text: res.error, problems: res.problems });
      }
    });
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Notion</Eyebrow>
          <p className="mt-1.5 flex items-center gap-2 text-[14px] font-semibold text-n-800">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ background: connected ? "var(--color-ok)" : "var(--color-n-300)" }}
            />
            {connected ? "Connected" : "Not connected"}
          </p>
          <p className="mt-1 text-[12.5px] leading-5 text-n-500">
            {connected
              ? <>Pulling new tasks from <strong className="font-semibold text-n-700">{title}</strong> into your todo inbox.</>
              : "Tasks you jot into Notion on your phone land in Livio’s todo inbox."}
          </p>
        </div>
        {connected && (
          <button
            onClick={() => {
              if (!confirm("Disconnect Notion? Tasks already pulled in stay in Livio.")) return;
              startTransition(async () => {
                await disconnectNotion();
                router.refresh();
              });
            }}
            disabled={pending}
            className="rounded-md border border-n-200 px-3 py-2 text-[12.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50"
          >
            Disconnect
          </button>
        )}
      </div>

      {!connected && (
        <form onSubmit={connect} className="mt-5 space-y-3 border-t border-n-100 pt-5">
          <ol className="list-decimal space-y-1 pl-4 text-[12.5px] leading-5 text-n-600">
            <li>
              Create an internal integration at{" "}
              <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" className="font-medium text-rust-600 underline-offset-2 hover:underline">
                notion.so/my-integrations
              </a>{" "}
              and copy its secret.
            </li>
            <li>Open your To-do database, choose ••• → Connections, and add the integration.</li>
            <li>Copy the database’s link and paste both below.</li>
          </ol>

          <label className="block">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-n-500">Integration secret</span>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="ntn_…"
              autoComplete="off"
              spellCheck={false}
              className="mt-1 block w-full rounded-md border border-n-200 bg-n-0 px-3 py-2 font-num text-[13px] text-n-800 outline-none transition-colors placeholder:text-n-400 focus:border-rust-400"
            />
          </label>
          <label className="block">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-n-500">Database link</span>
            <input
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder="https://www.notion.so/…"
              spellCheck={false}
              className="mt-1 block w-full rounded-md border border-n-200 bg-n-0 px-3 py-2 font-num text-[13px] text-n-800 outline-none transition-colors placeholder:text-n-400 focus:border-rust-400"
            />
          </label>

          {error && (
            <div className="animate-fade-in rounded-md bg-danger-soft px-3.5 py-2.5 text-[12.5px] leading-5 text-danger">
              <p className="font-medium">{error.text}</p>
              {error.problems && (
                <ul className="mt-1 list-disc pl-4">
                  {error.problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={pending || !secret.trim() || !database.trim()}
            className="rounded-md bg-rust-500 px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600 disabled:bg-n-300"
          >
            {pending ? "Checking…" : "Connect Notion"}
          </button>
        </form>
      )}
    </Card>
  );
}
