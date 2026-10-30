"use client";

import { useMemo, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { backdropProps, ModalLock, Portal } from "@/lib/hooks/useModal";
import { NO_AUTOFILL } from "@/lib/livio/keys";
import { completions, parseCommand, type Field, type PageCommand, type ParsedCommand } from "@/lib/livio/table";

/**
 * The `:` bar. Type a command, see where it's going, press Enter.
 *
 * Suggestions follow what's typed; ↑↓ move through them and Tab takes one.
 * `:s …` searches as you type - the table filters behind the bar - and Escape
 * puts the old search back. A command the page doesn't know is said so here,
 * rather than silently doing nothing.
 */
export function CommandBar({
  initial,
  commands,
  fields,
  onRun,
  onPreview,
  onClose,
  table = true,
}: {
  initial: string;
  commands: PageCommand[];
  fields: Field[];
  /** Return an error message to keep the bar open and show it. */
  onRun: (cmd: ParsedCommand) => string | void;
  /** A search being typed, or null to put the committed one back. */
  onPreview?: (query: string | null) => void;
  onClose: () => void;
  /** False on a page that isn't a table: no search, sort or filter. */
  table?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const list = useMemo(() => completions(text, commands, fields, table), [text, commands, fields, table]);

  const close = () => {
    onPreview?.(null);
    onClose();
  };

  const change = (next: string) => {
    setText(next);
    setActive(-1);
    setError(null);
    const parsed = parseCommand(next, commands, fields, table);
    onPreview?.(parsed.kind === "search" ? parsed.query : null);
  };

  const fill = (i: number) => {
    const c = list[i];
    if (c) change(c.fill);
  };

  const submit = () => {
    let parsed = parseCommand(text, commands, fields, table);
    // A highlighted suggestion - or the only one, when what's typed means
    // nothing yet - is what Enter takes. One that still needs an argument
    // ("^ ", "s ") is filled in for typing rather than run half-finished.
    const unresolved = parsed.kind === "unknown" || (parsed.kind === "sort" && !parsed.field);
    const chosen = active >= 0 ? list[active] : unresolved && list.length === 1 ? list[0] : null;
    if (chosen) {
      if (chosen.fill.endsWith(" ")) {
        change(chosen.fill);
        return;
      }
      parsed = parseCommand(chosen.fill, commands, fields, table);
    }
    if (parsed.kind === "unknown") {
      setError(parsed.text ? `No command “${parsed.text}”. :help lists them.` : "Type a command - :help lists them.");
      return;
    }
    if (parsed.kind === "sort" && !parsed.field) {
      setError(parsed.text ? `No property “${parsed.text}” to sort by.` : "Sort by which property?");
      return;
    }
    const message = onRun(parsed);
    if (message) setError(message);
    else onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (list.length ? (i + 1) % list.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (list.length ? (i <= 0 ? list.length - 1 : i - 1) : -1));
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (list.length) fill(active >= 0 ? active : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Backspace" && !text) {
      // Deleting the colon itself, as in vim, closes the bar.
      e.preventDefault();
      close();
    }
  };

  return (
    <ModalLock onClose={close} initialFocus={input}>
      <Portal>
        <div
          className="animate-fade-in fixed inset-0 z-[70] flex items-start justify-center bg-[var(--scrim)] px-4 pt-[16vh] backdrop-blur-[2px]"
          {...backdropProps(close)}
          role="dialog"
          aria-modal="true"
          aria-label="Command"
        >
          <div className="animate-scale-in w-full max-w-[520px] overflow-hidden rounded-lg border border-n-100 bg-n-0 shadow-[var(--shadow-modal)]">
            <div className="flex items-center gap-2 px-4">
              <span aria-hidden className="font-num text-[17px] font-semibold text-rust-500">:</span>
              <input
                ref={input}
                value={text}
                onChange={(e) => change(e.target.value)}
                onKeyDown={onKey}
                {...NO_AUTOFILL}
                aria-label="Command"
                placeholder="Type a command, or help"
                className="h-12 min-w-0 flex-1 bg-transparent font-num text-[14px] text-n-800 outline-none placeholder:text-n-400"
              />
            </div>

            {error && (
              <p className="animate-fade-in border-t border-n-100 px-4 py-2 text-[12.5px] text-danger">{error}</p>
            )}

            {list.length > 0 && (
              <ul className="max-h-[300px] overflow-y-auto border-t border-n-100 p-1">
                {list.slice(0, 8).map((c, i) => (
                  <li key={c.fill + c.label}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => {
                        fill(i);
                        input.current?.focus();
                      }}
                      className={clsx(
                        "flex w-full items-baseline gap-3 rounded-md px-3 py-1.5 text-left",
                        i === active ? "bg-rust-50" : "",
                      )}
                    >
                      <span className={clsx("font-num text-[12.5px] font-medium", i === active ? "text-rust-700" : "text-n-700")}>
                        :{c.label}
                      </span>
                      <span className="truncate text-[12px] text-n-500">{c.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Portal>
    </ModalLock>
  );
}
