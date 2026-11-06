/**
 * The enhancement queue's rules - pure, so the composer, the server actions
 * and the tests share them. (The CLI and deploy side is scripts/queue/.)
 */

export const KINDS = ["bug", "feature", "tweak"] as const;
export type EnhancementKind = (typeof KINDS)[number];

export const STATUSES = ["queued", "question", "done", "wontfix"] as const;
export type EnhancementStatus = (typeof STATUSES)[number];

export const KIND_LABEL: Record<EnhancementKind, string> = { bug: "Bug", feature: "Feature", tweak: "Tweak" };
export const KIND_TONE: Record<EnhancementKind, "danger" | "info" | "warn"> = { bug: "danger", feature: "info", tweak: "warn" };

export const isKind = (k: unknown): k is EnhancementKind => KINDS.includes(k as EnhancementKind);
export const isStatus = (s: unknown): s is EnhancementStatus => STATUSES.includes(s as EnhancementStatus);

/** The next kind along, for Tab in the composer. */
export const nextKind = (k: EnhancementKind, back = false): EnhancementKind =>
  KINDS[(KINDS.indexOf(k) + (back ? KINDS.length - 1 : 1)) % KINDS.length];

const PREFIX = /^\s*(bug|feat|feature|tweak)\s*:\s*/i;

/**
 * What was typed in the composer: an optional "bug:" / "feat:" / "tweak:"
 * prefix sets the kind, the first line is the title, the rest is the body.
 */
export function parseEnhancement(text: string, fallback: EnhancementKind = "feature") {
  let kind = fallback;
  const m = text.match(PREFIX);
  if (m) {
    const word = m[1].toLowerCase();
    kind = word === "feat" ? "feature" : (word as EnhancementKind);
    text = text.slice(m[0].length);
  }
  const [first = "", ...rest] = text.split("\n");
  return { kind, title: first.trim(), body: rest.join("\n").trim() };
}

/** The kind a prefix being typed asks for, if any - so the chip can follow along. */
export function prefixKind(text: string): EnhancementKind | null {
  const m = text.match(PREFIX);
  if (!m) return null;
  return parseEnhancement(text).kind;
}

/** Where a newly queued item goes: the bottom. */
export const positionAfter = (positions: number[]) => (positions.length ? Math.max(...positions) : 0) + 1;

/**
 * Where an item lands when moved one step up (-1) or down (+1) among the
 * queued ones, already in order: halfway between its new neighbours.
 * Null when it's already at that end.
 */
export function movedPosition(ordered: { id: string; position: number }[], id: string, dir: -1 | 1): number | null {
  const i = ordered.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ordered.length) return null;
  const past = ordered[j + dir];
  const target = ordered[j].position;
  return past ? (target + past.position) / 2 : target + dir;
}

/** Appends the answer to a question Claude asked, so it travels with the item. */
export function withAnswer(body: string, question: string | null, answer: string) {
  const parts = [body.trim()];
  if (question?.trim()) parts.push(`**Claude asked:** ${question.trim()}`);
  parts.push(`**Answer:** ${answer.trim()}`);
  return parts.filter(Boolean).join("\n\n");
}
