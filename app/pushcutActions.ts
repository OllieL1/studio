"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { firePushcut, type PushcutEvent } from "@/lib/pushcut";
import { isPushcutUrl } from "@/lib/pushcutUrl";

type Result = { ok: true } | { ok: false; error: string };

export type PushcutInput = {
  on: boolean;
  /** Blank keeps the link already saved. */
  startUrl: string;
  endUrl: string;
  clearStart?: boolean;
  clearEnd?: boolean;
};

/** Save the switch and the two links. A blank link keeps the saved one (it is never sent back to the browser). */
export async function savePushcut(input: PushcutInput): Promise<Result> {
  const saved = await db.preference.findUnique({
    where: { id: "singleton" },
    select: { pushcutStartUrl: true, pushcutEndUrl: true },
  });
  const pick = (typed: string, clear: boolean | undefined, current: string | null | undefined, label: string) => {
    if (clear) return { value: null as string | null };
    const t = typed.trim();
    if (!t) return { value: current ?? null };
    if (!isPushcutUrl(t)) return { error: `The ${label} link should be a Pushcut link: https://api.pushcut.io/…/execute?shortcut=…` };
    return { value: t };
  };
  const start = pick(input.startUrl, input.clearStart, saved?.pushcutStartUrl, "start");
  const end = pick(input.endUrl, input.clearEnd, saved?.pushcutEndUrl, "end");
  if ("error" in start) return { ok: false, error: start.error! };
  if ("error" in end) return { ok: false, error: end.error! };
  if (input.on && !start.value && !end.value) return { ok: false, error: "Add at least one link before turning it on." };

  const data = { pushcutOn: input.on, pushcutStartUrl: start.value, pushcutEndUrl: end.value };
  await db.preference.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });
  revalidatePath("/settings", "layout");
  return { ok: true };
}

/** Fire one saved link right now, to see the phone react. */
export async function testPushcut(event: PushcutEvent): Promise<Result> {
  return firePushcut(event, { force: true });
}
