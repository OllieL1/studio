"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePushcut, testPushcut } from "@/app/pushcutActions";
import { Card, Eyebrow } from "./ui";

type Msg = { tone: "ok" | "bad"; text: string } | null;

/** Phone Focus mode: the two Pushcut links Studio calls as a session starts and stops. */
export function PushcutPanel({
  on,
  startMasked,
  endMasked,
}: {
  on: boolean;
  startMasked: string | null;
  endMasked: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(on);
  const [startUrl, setStartUrl] = useState("");
  const [endUrl, setEndUrl] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) =>
    startTransition(async () => {
      const res = await fn();
      setMsg(res.ok ? { tone: "ok", text: okText } : { tone: "bad", text: res.error });
      if (!res.ok) setEnabled(on);
      if (res.ok) {
        setStartUrl("");
        setEndUrl("");
        router.refresh();
      }
    });

  const save = (extra: { clearStart?: boolean; clearEnd?: boolean; on?: boolean } = {}) =>
    run(() => savePushcut({ startUrl, endUrl, ...extra, on: extra.on ?? enabled }), extra.on === undefined ? "Saved." : extra.on ? "On - sessions now switch your phone's Focus." : "Off.");

  // The switch saves itself: it is the one setting that makes sessions fire,
  // and it used to wait for Save, which was easy to miss.
  const toggle = (next: boolean) => {
    setEnabled(next);
    save({ on: next });
  };

  const field = (label: string, value: string, set: (v: string) => void, masked: string | null, clear: () => void, test: () => void) => (
    <div>
      <label className="text-[12px] font-semibold text-n-700">{label}</label>
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={masked ?? "https://api.pushcut.io/…/execute?shortcut=…"}
        spellCheck={false}
        autoComplete="off"
        className="font-num mt-1 w-full rounded-md border border-n-200 bg-transparent px-3 py-2 text-[12.5px] text-n-800 placeholder:text-n-400"
      />
      {masked && (
        <div className="mt-1 flex gap-3 text-[11.5px]">
          <button type="button" onClick={test} disabled={pending} className="font-semibold text-n-600 hover:text-n-800 disabled:opacity-50">
            Test
          </button>
          <button type="button" onClick={clear} disabled={pending} className="text-n-500 hover:text-danger disabled:opacity-50">
            Remove
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Phone Focus</Eyebrow>
          <p className="mt-1.5 text-[12.5px] leading-5 text-n-500">
            Turns a Focus mode on your phone on while a session runs, and off when you pause, stop or discard it.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[12.5px] font-semibold text-n-700">
          <input type="checkbox" checked={enabled} disabled={pending} onChange={(e) => toggle(e.target.checked)} />
          On
        </label>
      </div>

      <div className="mt-4 space-y-3">
        {field("Session starts or resumes", startUrl, setStartUrl, startMasked, () => save({ clearStart: true }), () => run(() => testPushcut("start"), "Sent - check your phone."))}
        {field("Session ends or pauses", endUrl, setEndUrl, endMasked, () => save({ clearEnd: true }), () => run(() => testPushcut("end"), "Sent - check your phone."))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => save()}
          disabled={pending}
          className="rounded-md border border-n-200 px-3 py-2 text-[12.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50"
        >
          {pending ? "Working..." : "Save"}
        </button>
        {msg && (
          <p className={`animate-fade-in text-[12px] font-medium ${msg.tone === "ok" ? "text-ok" : "text-danger"}`}>{msg.text}</p>
        )}
      </div>

      <p className="mt-4 border-t border-n-100 pt-3 text-[11.5px] leading-5 text-n-500">
        Paste each Shortcut&apos;s Pushcut link. The Pushcut Automation Server has to be running on the phone for them to fire. The links
        contain a secret, so a saved one is only shown hidden; leave a field blank to keep it.
      </p>
    </Card>
  );
}
