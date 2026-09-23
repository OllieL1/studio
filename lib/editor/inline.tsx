import { Fragment } from "react";

/**
 * Inline markdown, rendered without a round trip to the server.
 *
 * Table cells need **bold**, `code`, *emphasis* and links to show as
 * formatting rather than as syntax, but a cell is small and there are many of
 * them - firing a render request per cell would make typing feel slow. Only
 * inline marks are handled here; a cell can't hold a heading or a list.
 */

const SPLIT = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|~~[^~]+~~|\[[^\]]+\]\([^)]+\))/g;

export function InlineMarkdown({ text }: { text: string }) {
  if (!text) return null;

  const parts = text.split(SPLIT).filter((p) => p !== "" && p !== undefined);

  return (
    <>
      {parts.map((part, i) => {
        const key = `${i}-${part.slice(0, 8)}`;
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);

        if (link) {
          return (
            <a
              key={key}
              href={link[2]}
              target="_blank"
              rel="noreferrer"
              className="text-rust-600 underline decoration-rust-200 underline-offset-2"
              // The cell is a button; the link shouldn't also open the editor.
              onClick={(e) => e.stopPropagation()}
            >
              {link[1]}
            </a>
          );
        }
        if (/^(\*\*|__)/.test(part) && part.length > 4) {
          return <strong key={key} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        if (/^~~/.test(part) && part.length > 4) {
          return <s key={key} className="text-n-400">{part.slice(2, -2)}</s>;
        }
        if (/^(\*|_)/.test(part) && part.length > 2) {
          return <em key={key}>{part.slice(1, -1)}</em>;
        }
        if (/^`/.test(part) && part.length > 2) {
          return (
            <code key={key} className="font-num rounded-[3px] bg-n-100 px-1 py-px text-[0.92em] text-rust-700">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <Fragment key={key}>{part}</Fragment>;
      })}
    </>
  );
}
