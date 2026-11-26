/**
 * Purpose: what a downloaded note is called and what's in it, shared by the
 * note export routes under app/api/project/notes.
 */
import { MENTION_RE, stripMentions } from "./mentions";

export const fileSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function noteMarkdown(title: string, body: string): string {
  // Link chips become real links first, so their URL isn't lost with the chip.
  const linked = body.replace(MENTION_RE, (chip, sigil: string, url: string, label?: string) =>
    sigil !== "u" ? chip : label ? `[${label}](${url})` : `<${url}>`,
  );
  return `# ${title}\n\n${stripMentions(linked).trimEnd()}\n`;
}
