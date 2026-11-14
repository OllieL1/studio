/** Reopening the database after the stick drops out (lib/dbRecovery.ts). */
import assert from "node:assert/strict";
import { isDiskIoError, sharedReconnect, withRecovery } from "../lib/dbRecovery";

const tests: [string, () => Promise<void>][] = [];
const test = (n: string, f: () => Promise<void>) => tests.push([n, f]);

/** The message Prisma gave on 14 Nov 2026, trimmed. */
const ioError = () =>
  new Error(
    'Invalid `prisma.preference.findUnique()` invocation:\n\nError occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(SqliteError { extended_code: 266, message: Some("disk I/O error") }), transient: false })',
  );

/** A query that fails with `errors` in turn, then returns "ok". */
function flaky(...errors: Error[]) {
  const calls = { run: 0, reconnect: 0 };
  return {
    calls,
    run: async () => {
      const e = errors[calls.run++];
      if (e) throw e;
      return "ok";
    },
    reconnect: async () => void calls.reconnect++,
  };
}

test("recognises a disk I/O error by its message", async () => {
  assert.equal(isDiskIoError(ioError()), true);
  assert.equal(isDiskIoError(new Error("Unique constraint failed")), false);
  assert.equal(isDiskIoError("disk I/O error"), false);
});

test("a read that hits a disk I/O error reconnects and runs again", async () => {
  const q = flaky(ioError());
  assert.equal(await withRecovery("findUnique", q.run, q.reconnect), "ok");
  assert.deepEqual(q.calls, { run: 2, reconnect: 1 });
});

test("a write reconnects but is not run twice", async () => {
  const q = flaky(ioError());
  await assert.rejects(withRecovery("create", q.run, q.reconnect), /disk I\/O error/);
  assert.deepEqual(q.calls, { run: 1, reconnect: 1 });
});

test("a read is retried only once: a stick that is really gone still errors", async () => {
  const q = flaky(ioError(), ioError());
  await assert.rejects(withRecovery("findMany", q.run, q.reconnect), /disk I\/O error/);
  assert.deepEqual(q.calls, { run: 2, reconnect: 1 });
});

test("other errors pass straight through without a reconnect", async () => {
  const q = flaky(new Error("Unique constraint failed"));
  await assert.rejects(withRecovery("findFirst", q.run, q.reconnect), /Unique constraint/);
  assert.deepEqual(q.calls, { run: 1, reconnect: 0 });
});

test("queries that fail together share one reconnect", async () => {
  let reconnects = 0;
  let release!: () => void;
  const reconnect = sharedReconnect(() => {
    reconnects++;
    return new Promise<void>((r) => (release = r));
  });
  const both = Promise.all([reconnect(), reconnect()]);
  release();
  await both;
  assert.equal(reconnects, 1);
  const again = reconnect();
  release();
  await again;
  assert.equal(reconnects, 2, "a later failure gets a fresh reconnect");
});

(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (e) {
      console.error(`  ✗ ${name}`);
      throw e;
    }
  }
  console.log(`dbRecovery: ${tests.length} passed`);
})().catch(() => process.exit(1));
