import { MENTION_RE } from "../mentions";

/**
 * The active block's stand-in for a mention: `@[Label]` in place of the full
 * `@r[hu2021lora|LoRA]` - short enough to read and write a sentence around.
 * The block's real text is always the full markdown, even while it's being
 * edited; this is purely what the textarea shows and types against, expanded
 * back to the real thing on every keystroke. See LiveEditor.tsx's mention
 * handling for how it's kept in sync.
 *
 * There's no editing a mention in place - delete it and pick again - so the
 * only two things that ever change how many there are, `insertMentionShorthand`
 * and `deleteShorthandBefore`, are the only places the bookkeeping has to be
 * exact. Everything else - typing, arrow keys, Tab - leaves the count and
 * order alone, so the tokens list doesn't need to move with it.
 */

const SHORTHAND_RE = /@\[([^\]]*)\]/g;

/** Full markdown → shorthand text, plus the full tokens it stood for, in the
 *  order they appear - the starting state for a block's editing session. */
export function compactMentions(text: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const compact = text.replace(MENTION_RE, (whole, _sigil: string, id: string, label?: string) => {
    tokens.push(whole);
    return `@[${(label ?? id).trim()}]`;
  });
  return { text: compact, tokens };
}

/**
 * Shorthand text back to real markdown, matching each `@[...]` to the token
 * it stood for purely by the order they appear in - the only thing tying
 * the two together once a keystroke only ever sees the shorthand - so two
 * mentions sharing a label are never confused with each other. A `@[...]`
 * with no token left to match (mangled by a selection that spanned it,
 * say) is left as plain text rather than silently dropped.
 */
export function expandMentions(text: string, tokens: string[]): string {
  let i = 0;
  return text.replace(SHORTHAND_RE, (whole) => tokens[i++] ?? whole);
}

/** How many shorthand mentions sit before `pos` - where a new one belongs
 *  in the tokens list. */
export function mentionIndexAt(text: string, pos: number): number {
  return (text.slice(0, pos).match(SHORTHAND_RE) ?? []).length;
}

/** A freshly-chosen mention: `label` is what the textarea shows, `full` is
 *  what it expands back to. Replaces the `@query` typed so far, same as
 *  choosing from the `[` menu replaces its trigger text. */
export function insertMentionShorthand(
  text: string,
  start: number,
  end: number,
  tokens: string[],
  full: string,
  label: string,
): { text: string; caret: number; tokens: string[] } {
  const shown = `@[${label}] `;
  const index = mentionIndexAt(text, start);
  return {
    text: text.slice(0, start) + shown + text.slice(end),
    caret: start + shown.length,
    tokens: [...tokens.slice(0, index), full, ...tokens.slice(index)],
  };
}

/**
 * Backspace right after a shorthand mention removes the whole `@[Label]` -
 * what a chip should do when backspaced into, rather than eating one
 * character of it at a time.
 */
export function deleteShorthandBefore(
  text: string,
  caret: number,
  tokens: string[],
): { text: string; caret: number; tokens: string[] } | null {
  const before = text.slice(0, caret);
  const m = /@\[[^\]]*\]$/.exec(before);
  if (!m) return null;
  const start = caret - m[0].length;
  const index = mentionIndexAt(text, start);
  return {
    text: text.slice(0, start) + text.slice(caret),
    caret: start,
    tokens: [...tokens.slice(0, index), ...tokens.slice(index + 1)],
  };
}
