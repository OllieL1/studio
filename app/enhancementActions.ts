"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  isKind, movedPosition, parseEnhancement, positionAfter, withAnswer,
  type EnhancementKind, type EnhancementStatus,
} from "@/lib/enhancements";

/*
 * The enhancement queue (Settings → Enhancements, ⌥Q from anywhere). Claude
 * Code reads it with `npm run queue`; its resolutions come back through the
 * deploy, not through here - see scripts/queue/lib.mjs.
 */

export type EnhancementRow = {
  id: string;
  number: number;
  kind: EnhancementKind;
  title: string;
  body: string;
  app: string;
  path: string | null;
  status: EnhancementStatus;
  resolution: string | null;
  commit: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

const select = {
  id: true, number: true, kind: true, title: true, body: true, app: true, path: true,
  status: true, resolution: true, commit: true, createdAt: true, resolvedAt: true,
} as const;

const refresh = () => revalidatePath("/settings", "layout");

/** Every item: open ones in queue order, then the closed ones, latest first. */
export async function listEnhancements(): Promise<EnhancementRow[]> {
  const rows = await db.enhancement.findMany({ select: { ...select, position: true }, orderBy: { position: "asc" } });
  const open = rows.filter((r) => r.status === "queued" || r.status === "question");
  const closed = rows
    .filter((r) => r.status === "done" || r.status === "wontfix")
    .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0));
  return [...open, ...closed].map(({ position: _, ...r }) => r as EnhancementRow);
}

/** Queues what was typed in the composer; "bug:" etc. up front sets the kind. */
export async function addEnhancement(input: {
  text: string;
  kind: EnhancementKind;
  app: string;
  path: string | null;
}): Promise<{ number: number }> {
  const { kind, title, body } = parseEnhancement(input.text, isKind(input.kind) ? input.kind : "feature");
  if (!title) throw new Error("An enhancement needs a title.");
  const { _max } = await db.enhancement.aggregate({ _max: { number: true, position: true } });
  const row = await db.enhancement.create({
    data: {
      number: (_max.number ?? 0) + 1,
      kind,
      title,
      body,
      app: input.app === "livio" ? "livio" : "studio",
      path: input.path?.slice(0, 300) || null,
      position: positionAfter(_max.position == null ? [] : [_max.position]),
    },
    select: { number: true },
  });
  refresh();
  return row;
}

export async function editEnhancement(id: string, patch: { title?: string; body?: string; kind?: EnhancementKind }) {
  const data: { title?: string; body?: string; kind?: EnhancementKind } = {};
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new Error("An enhancement needs a title.");
    // Kept whole - a long title is the person's call, and nothing is cut.
    data.title = patch.title.trim();
  }
  if (patch.body !== undefined) data.body = patch.body;
  if (patch.kind !== undefined && isKind(patch.kind)) data.kind = patch.kind;
  await db.enhancement.update({ where: { id }, data });
  refresh();
}

/** One step up or down the queue. */
export async function moveEnhancement(id: string, dir: -1 | 1) {
  const queued = await db.enhancement.findMany({
    where: { status: "queued" },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  const position = movedPosition(queued, id, dir);
  if (position == null) return;
  await db.enhancement.update({ where: { id }, data: { position } });
  refresh();
}

/** Answers Claude's question and puts the item back in the queue, at the top. */
export async function answerEnhancement(id: string, answer: string) {
  if (!answer.trim()) throw new Error("Write an answer first.");
  const row = await db.enhancement.findUniqueOrThrow({ where: { id }, select: { body: true, resolution: true } });
  const { _min } = await db.enhancement.aggregate({ where: { status: "queued" }, _min: { position: true } });
  await db.enhancement.update({
    where: { id },
    data: {
      body: withAnswer(row.body, row.resolution, answer),
      status: "queued",
      resolution: null,
      position: (_min.position ?? 1) - 1,
    },
  });
  refresh();
}

/** Back into the queue (a done item that isn't, after all), or out of it. */
export async function setEnhancementStatus(id: string, status: "queued" | "wontfix") {
  if (status === "queued") {
    const { _max } = await db.enhancement.aggregate({ _max: { position: true } });
    await db.enhancement.update({ where: { id }, data: { status, position: (_max.position ?? 0) + 1 } });
  } else {
    await db.enhancement.update({ where: { id }, data: { status, resolution: "Dropped from the queue." } });
  }
  refresh();
}

export async function deleteEnhancement(id: string) {
  await db.enhancement.delete({ where: { id } });
  refresh();
}
