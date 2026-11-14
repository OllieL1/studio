import { PrismaClient } from "@prisma/client";
import { sharedReconnect, withRecovery } from "./dbRecovery";

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
 *
 * If the stick drops out, that one connection is left holding a dead file
 * handle. The client below reopens it on a disk I/O error (lib/dbRecovery.ts).
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

/**
 * `journal_mode` is stored in the file, so it only really has to be set once;
 * the other two are per-connection, so they are set again on every new
 * connection.
 */
async function tune(client: PrismaClient): Promise<void> {
  for (const pragma of ["busy_timeout = 10000", "journal_mode = WAL", "synchronous = NORMAL"]) {
    await client.$queryRawUnsafe(`PRAGMA ${pragma}`).catch(() => {});
  }
}

function createDb() {
  const base = new PrismaClient({
    datasourceUrl: connectionUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  // Queued ahead of everything else at startup.
  void tune(base);

  const reconnect = sharedReconnect(async () => {
    console.warn("[db] disk I/O error: reopening the database connection");
    await base.$disconnect().catch(() => {});
    await tune(base);
  });

  return base.$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        return withRecovery(operation, () => query(args), reconnect);
      },
    },
  });
}

export type Db = ReturnType<typeof createDb>;

/** Single instance, cached across hot reloads in dev so we don't exhaust
 *  connections. */
const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const db = globalForPrisma.prisma ?? createDb();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
