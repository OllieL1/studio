/**
 * Getting the database back after the stick drops out.
 *
 * On 14 Nov 2026 the stick briefly went away under a running server: a
 * background write failed its fsync (SQLITE_IOERR_FSYNC, 1034) and every
 * query after that failed with SQLITE_IOERR_READ (266). The stick came back,
 * but the one pooled connection kept its dead file handle, so every page
 * returned an Internal Server Error until Studio was restarted.
 *
 * Restarting only did one useful thing: it opened a new connection. This
 * file does that without the restart. On a disk I/O error it reopens the
 * connection. A read is then tried once more. A write is not, because
 * SQLite can't tell us whether a failed write landed, and running it again
 * could do it twice; the caller gets the error and the next request uses the
 * new connection.
 *
 * Kept free of Prisma so the rules can be tested without a database.
 */

/** Operations that only read, so running them twice is harmless. */
const READS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "$queryRaw",
  "$queryRawUnsafe",
]);

export function isReadOperation(operation: string): boolean {
  return READS.has(operation);
}

/** Every SQLITE_IOERR variant prints this, whatever its extended code. */
export function isDiskIoError(e: unknown): boolean {
  return e instanceof Error && /disk I\/O error/i.test(e.message);
}

/**
 * Errors that mean the connection is unusable and a new one is needed: a disk
 * I/O error, or Prisma's "Engine is not yet connected".
 *
 * The second showed up on 18 Nov 2026. The first fix reopened the connection
 * by calling `$disconnect` on the client every request shares. Requests that
 * arrived while it was disconnecting ran against a dead engine and got "Engine
 * is not yet connected". That wasn't a disk I/O error, so nothing reconnected
 * again, and Studio served Internal Server Errors until it was restarted.
 */
export function isConnectionLost(e: unknown): boolean {
  return isDiskIoError(e) || (e instanceof Error && /Engine is not yet connected/i.test(e.message));
}

/**
 * Runs `run`. If the connection is lost, calls `reconnect` and, for a read,
 * runs `retry` once (on the new connection). Any other error is passed
 * straight through.
 */
export async function withRecovery<T>(
  operation: string,
  run: () => Promise<T>,
  reconnect: () => Promise<void>,
  retry: () => Promise<T> = run,
): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!isConnectionLost(e)) throw e;
    await reconnect();
    if (!isReadOperation(operation)) throw e;
    return retry();
  }
}

/**
 * Makes concurrent callers share one reconnect: queries that failed together
 * shouldn't each tear the connection down again.
 */
export function sharedReconnect(reconnect: () => Promise<void>): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return () => {
    inFlight ??= reconnect().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
