/**
 * @ mentions, and the link chips that share their syntax.
 *
 * A mention is stored in the markdown itself as `@r[hu2021lora|LoRA]`: the
 * kind, what it points at, and the label to draw. Keeping the label inline
 * means rendering stays a pure function - no database lookup to show a note -
 * which matters because the same renderer runs for the editor, the printed
 * PDF and the search index.
 *
 * The prefixes are the ones typed at the keyboard: `@r` research, `@#` tag,
 * `@t` task, `@n` note, `@m` meeting. `@u` is the odd one out - it isn't
 * typed, it's what a pasted link becomes.
 */

export type MentionKind = "paper" | "tag" | "task" | "note" | "meeting" | "link";

const PREFIX: Record<string, MentionKind> = {
  r: "paper",
  "#": "tag",
  t: "task",
  n: "note",
  m: "meeting",
  u: "link",
};

const SIGIL: Record<MentionKind, string> = {
  paper: "r",
  tag: "#",
  task: "t",
  note: "n",
  meeting: "m",
  link: "u",
};

/** What the menu offers, in the order it offers it. */
export const MENTION_KINDS: { kind: MentionKind; prefix: string; label: string; hint: string }[] = [
  { kind: "paper", prefix: "@r", label: "Paper", hint: "from the research library" },
  { kind: "tag", prefix: "@#", label: "Tag", hint: "shared with research" },
  { kind: "task", prefix: "@t", label: "Task", hint: "project tasks" },
  { kind: "note", prefix: "@n", label: "Note", hint: "another Nexus note" },
  { kind: "meeting", prefix: "@m", label: "Meeting", hint: "supervisor meetings" },
];

export type Mention = {
  kind: MentionKind;
  /** Cite key, tag name, or record id - whatever identifies the target. */
  id: string;
  label: string;
};

/** `@r[key|Label]`, with the label optional. */
export const MENTION_RE = /@([r#tnmu])\[([^\]|]+)(?:\|([^\]]*))?\]/g;

export function serializeMention(kind: MentionKind, id: string, label?: string): string {
  const clean = (s: string) => s.replace(/[\][|]/g, "").trim();
  const text = label && clean(label) && clean(label) !== clean(id) ? `|${clean(label)}` : "";
  return `@${SIGIL[kind]}[${clean(id)}${text}]`;
}

/** Every mention in a piece of markdown, in order. */
export function extractMentions(md: string): Mention[] {
  const out: Mention[] = [];
  for (const m of md.matchAll(MENTION_RE)) {
    const kind = PREFIX[m[1]];
    if (!kind) continue;
    out.push({ kind, id: m[2].trim(), label: (m[3] ?? m[2]).trim() });
  }
  return out;
}

/** Does this markdown mention that thing? Used for backlinks. */
export function mentions(md: string, kind: MentionKind, id: string): boolean {
  const wanted = id.trim().toLowerCase();
  return extractMentions(md).some((m) => m.kind === kind && m.id.toLowerCase() === wanted);
}

/** Where a chip links to. */
export function mentionHref(kind: MentionKind, id: string): string {
  switch (kind) {
    case "paper":
      return `/project?tab=research&paper=${encodeURIComponent(id)}`;
    case "tag":
      return `/project/tags/${encodeURIComponent(id.toLowerCase())}`;
    case "task":
      return `/tasks/${id}`;
    case "note":
      return `/project/nexus/${id}`;
    case "meeting":
      return `/project/meetings/${id}`;
    case "link":
      return id;
  }
}

/** The mention text with chips reduced to their labels - for excerpts. */
export function stripMentions(md: string): string {
  return md.replace(MENTION_RE, (_, sigil: string, id: string, label?: string) =>
    sigil === "#" ? `#${id}` : (label ?? id),
  );
}

/**
 * Rewrite every mention of a tag when it's renamed, so notes don't keep the
 * old name. Tags are the one kind whose id is also its label.
 */
export function renameTagMentions(md: string, from: string, to: string): string {
  return md.replace(MENTION_RE, (whole, sigil: string, id: string) =>
    sigil === "#" && id.trim().toLowerCase() === from.trim().toLowerCase()
      ? serializeMention("tag", to)
      : whole,
  );
}

/* ── Links ───────────────────────────────────────────────────────────────── */

/** "arxiv.org" from a URL, for the chip's prefix. */
export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0];
  }
}

/** A readable fallback when a page's title can't be fetched. */
export function linkFallbackLabel(url: string): string {
  const domain = linkDomain(url);
  try {
    const path = new URL(url).pathname.replace(/\/$/, "");
    return path && path !== "/" ? `${domain}${path}` : domain;
  } catch {
    return domain;
  }
}

export const isHttpUrl = (s: string): boolean => /^https?:\/\/\S+$/i.test(s.trim());
