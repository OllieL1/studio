/**
 * Saving without overwriting someone else's save.
 *
 * Every save says what the editor believes is already stored, and the server
 * only writes if that's still true. Without it, an editor holding an old copy
 * of a note - a second tab, or a page the browser's Back button restored as
 * it was half an hour ago - saves that old copy over everything written since,
 * on its first blur. That's how 12 Nov's peer reviews went back to their
 * heading.
 *
 * A refused save stops the editor saving at all: what's on screen is kept,
 * and the editor offers to copy it and reload.
 */

export type SaveResult = { ok: true } | { ok: false; conflict: true };

export const CONFLICT = { ok: false, conflict: true } as const satisfies SaveResult;

export const isConflict = (r: unknown): boolean =>
  typeof r === "object" && r !== null && (r as { conflict?: unknown }).conflict === true;

/** A task's notes are stored as null when there's nothing in them. */
export const storedTaskNotes = (markdown: string): string | null => (markdown.trim() ? markdown : null);

export type SaveOutcome = "saved" | "unchanged" | "conflict" | "stopped";

/**
 * The editor's side: what was last stored, and whether a conflict has
 * stopped saving. `send` writes `text` only if the store still holds
 * `expected`, and returns CONFLICT when it doesn't.
 */
export function createSaver(initial: string, send: (text: string, expected: string) => Promise<unknown>) {
  let stored = initial;
  let stopped = false;
  return {
    /** What the editor believes is stored - the "unsaved changes" baseline. */
    get stored() {
      return stored;
    },
    get stopped() {
      return stopped;
    },
    /** The store turned out to hold `text` (the page was stale), and the
     *  editor has been reset to it - so that's the baseline now. */
    rebase(text: string) {
      if (!stopped) stored = text;
    },
    async save(text: string): Promise<SaveOutcome> {
      if (stopped) return "stopped";
      if (text === stored) return "unchanged";
      const expected = stored;
      // Moved on before the round trip, so the next save (queued behind this
      // one) expects this text rather than resending it.
      stored = text;
      let result: unknown;
      try {
        result = await send(text, expected);
      } catch (e) {
        // Didn't land, as far as we know: the next save tries again.
        if (stored === text) stored = expected;
        throw e;
      }
      if (isConflict(result)) {
        stopped = true;
        stored = expected;
        return "conflict";
      }
      return "saved";
    },
  };
}
