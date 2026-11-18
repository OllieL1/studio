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

/** How long a replaced client is left to finish its in-flight queries. */
const RETIRE_AFTER_MS = 30_000;

function newBase(): PrismaClient {
  const base = new PrismaClient({
    datasourceUrl: connectionUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  // Queued ahead of everything else on the new connection.
  void tune(base);
  return base;
}

/**
 * Reconnecting builds a whole new client and swaps it in. Calling
 * `$disconnect` on the shared one instead races the requests still using it
 * ("Engine is not yet connected"), and if the disconnect itself fails on the
 * stick the client can stay broken for good. The old client is disconnected
 * later, once its queries have had time to finish, and any error is ignored.
 */
function createDb() {
  let base = newBase();

  const reconnect = sharedReconnect(async () => {
    console.warn("[db] connection lost: opening a new database connection");
    const old = base;
    base = newBase();
    setTimeout(() => void old.$disconnect().catch(() => {}), RETIRE_AFTER_MS).unref?.();
  });

  const extend = (client: PrismaClient) =>
    client.$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          // The retry goes to whichever client is current after the reconnect.
          const retry = () => {
            if (!model) return query(args);
            const delegate = (base as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[
              model[0].toLowerCase() + model.slice(1)
            ];
            return delegate[operation](args) as ReturnType<typeof query>;
          };
          return withRecovery(operation, () => query(args), reconnect, retry);
        },
      },
    });

  type Extended = ReturnType<typeof extend>;
  const extended = new WeakMap<PrismaClient, Extended>();
  const current = (): Extended => {
    let client = extended.get(base);
    if (!client) extended.set(base, (client = extend(base)));
    return client;
  };

  // Every property is looked up on the current client, so callers holding
  // `db` pick up a new connection without re-importing anything.
  return new Proxy({} as Extended, {
    get(_, prop) {
      const client = current();
      const value = Reflect.get(client, prop, client);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

export type Db = ReturnType<typeof createDb>;

/** Single instance, cached across hot reloads in dev so we don't exhaust
 *  connections. */
const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const db = globalForPrisma.prisma ?? createDb();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
