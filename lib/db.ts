import { PrismaClient } from "@prisma/client";

/** Single Prisma instance, cached across hot reloads in dev so we don't
 *  exhaust connections. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaTuned?: boolean };

/**
 * One connection, and SQLite tuned for a stick.
 *
 * The database lives on USB flash, where a write is slow and - in SQLite's
 * default rollback journal - holds an exclusive lock that every reader has to
 * wait behind. That contention is what a P1008 socket timeout looks like, and
 * one showed up on 28 Sep 2026 while the `@` menu was querying in the
 * background.
 *
 * WAL removes the contention: readers no longer block on the writer. A single
 * pooled connection then means queries queue in order rather than racing each
 * other for the file, and `busy_timeout` makes anything that does still
 * collide wait instead of failing. `VACUUM INTO` (lib/backup.ts) stays correct
 * under WAL, so backups are unaffected.
 */
function connectionUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base?.startsWith("file:")) return base;
  const [path, query] = base.split("?");
  const params = new URLSearchParams(query);
  params.set("connection_limit", "1");
  params.set("socket_timeout", "30");
  return `${path}?${params}`;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: connectionUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * Queued ahead of everything else at startup. `journal_mode` is stored in the
 * file, so it only really has to be set once; the other two are per-connection
 * and there is only ever one.
 */
if (!globalForPrisma.prismaTuned) {
  globalForPrisma.prismaTuned = true;
  void (async () => {
    for (const pragma of ["busy_timeout = 10000", "journal_mode = WAL", "synchronous = NORMAL"]) {
      await db.$queryRawUnsafe(`PRAGMA ${pragma}`).catch(() => {});
    }
  })();
}
