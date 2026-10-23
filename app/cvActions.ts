"use server";

import { db } from "@/lib/db";
import { BLANK_CV } from "@/lib/cv/blank";
import { importVersion, NO_OVERRIDES, withIds, type CvDoc, type Overrides } from "@/lib/cv/model";

/*
 * The CV: one master row and a row per tailored version. The editor saves on
 * its own debounce, so these are small and dumb - the rules live in
 * lib/cv/model.ts, which the editor runs before anything gets here.
 */

export type VersionSummary = {
  id: string;
  name: string;
  updatedAt: Date;
  careers: { id: string; company: string; role: string | null }[];
};

export async function getMaster(): Promise<CvDoc> {
  const row = await db.cvMaster.findUnique({ where: { id: "singleton" } });
  if (row) return JSON.parse(row.doc) as CvDoc;
  // A brand-new database: an empty CV to fill in. The real one only ever
  // lives in the database - never in the repository.
  const doc = withIds(BLANK_CV);
  await db.cvMaster.create({ data: { id: "singleton", doc: JSON.stringify(doc) } });
  return doc;
}

function parseOverrides(raw: string): Overrides {
  try {
    return { ...NO_OVERRIDES, ...(JSON.parse(raw) as Partial<Overrides>) };
  } catch {
    return { ...NO_OVERRIDES };
  }
}

export async function listVersions(): Promise<VersionSummary[]> {
  const rows = await db.cvVersion.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true, careers: { select: { id: true, company: true, role: true } } },
  });
  return rows;
}

export async function getVersion(id: string): Promise<{ id: string; name: string; overrides: Overrides } | null> {
  const row = await db.cvVersion.findUnique({ where: { id } });
  return row ? { id: row.id, name: row.name, overrides: parseOverrides(row.overrides) } : null;
}

export async function saveMaster(doc: CvDoc) {
  await db.cvMaster.upsert({
    where: { id: "singleton" },
    update: { doc: JSON.stringify(doc) },
    create: { id: "singleton", doc: JSON.stringify(doc) },
  });
}

export async function saveVersion(id: string, overrides: Overrides) {
  await db.cvVersion.update({ where: { id }, data: { overrides: JSON.stringify(overrides) } });
}

/** A new version - blank (reads as the master), or a copy of another's changes. */
export async function createVersion(name: string, from?: string): Promise<string> {
  const source = from ? await db.cvVersion.findUnique({ where: { id: from }, select: { overrides: true } }) : null;
  const row = await db.cvVersion.create({
    data: { name: name.trim() || "Untitled version", overrides: source?.overrides ?? JSON.stringify(NO_OVERRIDES) },
  });
  return row.id;
}

export async function renameVersion(id: string, name: string) {
  if (name.trim()) await db.cvVersion.update({ where: { id }, data: { name: name.trim() } });
}

export async function deleteVersion(id: string) {
  await db.cvVersion.deleteMany({ where: { id } });
}

/**
 * Versions exported from the old builder ("Download JSON"), each turned into
 * overrides on the master. Anything a version had that the master didn't
 * joins the master, hidden there, so the version still reads exactly as it did.
 */
export async function importVersions(files: { name?: string; cv?: unknown }[]): Promise<{ imported: string[]; failed: number }> {
  let master = await getMaster();
  const imported: string[] = [];
  let failed = 0;
  for (const f of files) {
    const cv = (f.cv ?? f) as { contact?: unknown; sections?: unknown };
    if (!cv || !Array.isArray(cv.contact) || !Array.isArray(cv.sections)) {
      failed++;
      continue;
    }
    const state = importVersion(master, cv);
    master = state.master;
    const row = await db.cvVersion.create({
      data: { name: (f.name ?? "Imported").trim() || "Imported", overrides: JSON.stringify(state.overrides) },
    });
    imported.push(row.id);
  }
  await saveMaster(master);
  return { imported, failed };
}

/* ── Careers ────────────────────────────────────────────────────────────── */

export async function linkCareer(careerId: string, versionId: string | null) {
  await db.careerEntry.update({ where: { id: careerId }, data: { cvVersionId: versionId } });
}

/** "Stripe – Backend Engineer", made from the master and tied to that entry. */
export async function createVersionForCareer(careerId: string): Promise<string> {
  const entry = await db.careerEntry.findUniqueOrThrow({ where: { id: careerId }, select: { company: true, role: true } });
  const name = [entry.company || "Untitled", entry.role].filter(Boolean).join(" – ");
  const id = await createVersion(name);
  await linkCareer(careerId, id);
  return id;
}
