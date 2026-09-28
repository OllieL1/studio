"use client";

import type { Insert } from "@/lib/editor/blocks";
import { CaretMenu } from "./CaretMenu";

/**
 * The `[` menu: pick a block instead of remembering its markdown.
 * All the behaviour lives in CaretMenu; this is the list it shows.
 */
export function InsertMenu({
  items,
  anchor,
  onChoose,
  onClose,
}: {
  items: Insert[];
  anchor: HTMLElement | null;
  onChoose: (insert: Insert) => void;
  onClose: () => void;
}) {
  return (
    <CaretMenu
      anchor={anchor}
      items={items}
      itemKey={(i) => i.key}
      onChoose={onChoose}
      onClose={onClose}
      width={262}
      renderItem={(item) => (
        <>
          <span className="text-[13px] font-medium text-n-800">{item.label}</span>
          <span className="font-num ml-auto truncate text-[11px] text-n-400">{item.hint}</span>
        </>
      )}
    />
  );
}
