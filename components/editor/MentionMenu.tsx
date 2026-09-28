"use client";

import { useEffect, useState } from "react";
import type { MentionOption } from "@/app/api/mentions/route";
import { MENTION_KINDS, type MentionKind } from "@/lib/mentions";
import { CaretMenu } from "./CaretMenu";
import { clsx } from "@/lib/clsx";

const KIND_LABEL: Record<MentionKind, string> = {
  paper: "Paper",
  tag: "Tag",
  task: "Task",
  note: "Note",
  meeting: "Meeting",
  link: "Link",
};

const KIND_TINT: Record<MentionKind, string> = {
  paper: "bg-rust-50 text-rust-700",
  tag: "bg-info-soft text-info",
  task: "bg-ok-soft text-ok",
  note: "bg-n-100 text-n-600",
  meeting: "bg-warn-soft text-warn",
  link: "bg-n-100 text-n-600",
};

/**
 * The `@` menu: mention a paper, tag, task, note or meeting.
 *
 * Typing `@` alone searches everything; the prefixes narrow it - `@r` for
 * research, `@#` for a tag, `@t` task, `@n` note, `@m` meeting - and the rest
 * of what's typed searches within that. The prefix is never required.
 */
export function MentionMenu({
  anchor,
  query,
  kind,
  onChoose,
  onClose,
}: {
  anchor: HTMLElement | null;
  query: string;
  kind: MentionKind | null;
  onChoose: (option: MentionOption) => void;
  onClose: () => void;
}) {
  const [options, setOptions] = useState<MentionOption[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: query });
    if (kind) params.set("kind", kind);

    // A short debounce: the menu opens on a keystroke and this is a query.
    const timer = setTimeout(() => {
      fetch(`/api/mentions?${params}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d) => setOptions(d.options ?? []))
        .catch(() => {});
    }, 90);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, kind]);

  return (
    <CaretMenu
      anchor={anchor}
      items={options}
      itemKey={(o) => `${o.kind}:${o.id}`}
      onChoose={onChoose}
      onClose={onClose}
      width={330}
      emptyLabel={
        kind
          ? `No ${KIND_LABEL[kind].toLowerCase()} matches - Esc to keep typing`
          : `Nothing matches. Try ${MENTION_KINDS.map((k) => k.prefix).join(", ")}`
      }
      renderItem={(o) => (
        <>
          <span className={clsx("shrink-0 rounded-[4px] px-1.5 py-px text-[10px] font-semibold", KIND_TINT[o.kind])}>
            {KIND_LABEL[o.kind]}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-n-800">{o.label}</span>
          <span className="font-num shrink-0 truncate text-[10.5px] text-n-400">{o.hint}</span>
        </>
      )}
    />
  );
}
