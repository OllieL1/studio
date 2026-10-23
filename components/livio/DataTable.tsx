"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";
import { fmtDayDate } from "@/lib/dates";
import { isTypingTarget } from "@/lib/livio/keys";
import { Portal } from "@/lib/hooks/useModal";
import { parseDateInput, type Range, type Sort } from "@/lib/livio/table";

export type Option = { value: string; label: string };

export type Column<R> = {
  key: string;
  label: string;
  width: number;
  kind: "text" | "select" | "date" | "link";
  /** The text an edit starts from. */
  text: (row: R) => string;
  /** What the cell shows. `hl` wraps search matches in a highlight. */
  render?: (row: R, hl: (text: string) => React.ReactNode) => React.ReactNode;
  options?: (row: R) => Option[];
  editable?: (row: R) => boolean;
  /** Which way a vague typed date leans: Sent is behind you, a deadline ahead. */
  direction?: "past" | "future";
  /** For a link cell: where ⌘↵ goes. */
  href?: (row: R) => string | null;
};

export type CellValue = string | Date | null;

type Cursor = { row: number; col: number };

/**
 * A spreadsheet you drive from the keyboard.
 *
 * Arrows (or hjkl) move a cell cursor; Enter edits the cell where it is - a
 * text field, a picker, or a date you type in words; Esc backs out. Space or
 * o opens the row; ⌫ deletes it; ⌘↵ follows a link. Everything the mouse
 * does too: click to put the cursor down, double-click to edit, click a
 * heading to sort.
 *
 * It only draws and dispatches. Rows, sorting and saving belong to the page.
 */
export function DataTable<R>({
  rows,
  columns,
  rowId,
  onCommit,
  onOpen,
  onDelete,
  onSort,
  sort,
  dim,
  highlight,
  keysActive,
  focus,
  empty,
}: {
  rows: R[];
  columns: Column<R>[];
  rowId: (row: R) => string;
  onCommit: (row: R, column: string, value: CellValue) => void;
  onOpen?: (row: R) => void;
  onDelete?: (row: R) => void;
  onSort?: (column: string) => void;
  sort?: Sort | null;
  dim?: (row: R) => boolean;
  /** Search matches in a column's text. */
  highlight?: (text: string, column: string) => Range[];
  /** False while a dialog is open over the table. */
  keysActive: boolean;
  /** Put the cursor on this row - and optionally start editing - once it's there. */
  focus?: { id: string; column?: string; edit?: boolean; nonce: number } | null;
  empty?: React.ReactNode;
}) {
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [editing, setEditing] = useState(false);
  // The cursor follows its row, not its index, when rows re-sort under it.
  const cursorId = useRef<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const ids = useMemo(() => rows.map(rowId), [rows, rowId]);

  useLayoutEffect(() => {
    if (!cursor) return;
    const at = cursorId.current ? ids.indexOf(cursorId.current) : -1;
    if (at >= 0 && at !== cursor.row) setCursor({ ...cursor, row: at });
    else if (at < 0 && ids.length && cursor.row >= ids.length) setCursor({ ...cursor, row: ids.length - 1 });
    else if (!ids.length) setCursor(null);
  }, [ids, cursor]);

  // Each request is acted on once - as soon as its row is on screen - so
  // later edits to the rows don't keep pulling the cursor back to it.
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!focus || handled.current === focus.nonce) return;
    const r = ids.indexOf(focus.id);
    if (r < 0) return;
    handled.current = focus.nonce;
    const c = focus.column ? Math.max(0, columns.findIndex((col) => col.key === focus.column)) : 0;
    move({ row: r, col: c });
    if (focus.edit) setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, ids]);

  const move = (next: Cursor) => {
    const row = Math.max(0, Math.min(rows.length - 1, next.row));
    const col = Math.max(0, Math.min(columns.length - 1, next.col));
    cursorId.current = ids[row] ?? null;
    setCursor({ row, col });
    const el = ids[row] ? rowRefs.current.get(ids[row]) : null;
    el?.scrollIntoView({ block: "nearest" });
  };

  const current = cursor ? rows[cursor.row] : undefined;
  const column = cursor ? columns[cursor.col] : undefined;
  const canEdit = (r: R | undefined, c: Column<R> | undefined) => !!r && !!c && (c.editable?.(r) ?? true);

  useEffect(() => {
    if (!keysActive || editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.altKey) return;
      if (!rows.length) return;
      const meta = e.metaKey || e.ctrlKey;
      const at = cursor ?? { row: -1, col: 0 };
      const go = (next: Cursor) => {
        e.preventDefault();
        move(next);
      };

      if (meta) {
        if (e.key === "Enter" && current && column?.href) {
          const url = column.href(current);
          if (url) {
            e.preventDefault();
            window.open(url, "_blank", "noopener");
          }
        }
        return;
      }
      switch (e.key) {
        case "ArrowDown": case "j": return go({ row: at.row + 1, col: at.col });
        case "ArrowUp": case "k": return go({ row: Math.max(0, at.row - 1), col: at.col });
        case "ArrowRight": case "l": return go({ row: Math.max(0, at.row), col: at.col + 1 });
        case "ArrowLeft": case "h": return go({ row: Math.max(0, at.row), col: at.col - 1 });
        case "Tab": return go({ row: Math.max(0, at.row), col: at.col + (e.shiftKey ? -1 : 1) });
        case "g": return go({ row: 0, col: at.col });
        case "G": return go({ row: rows.length - 1, col: at.col });
        case "Home": return go({ row: Math.max(0, at.row), col: 0 });
        case "End": return go({ row: Math.max(0, at.row), col: columns.length - 1 });
        case "Escape":
          if (cursor) { e.preventDefault(); setCursor(null); cursorId.current = null; }
          return;
      }
      if (!current) return;
      if (e.key === "Enter" || e.key === "e" || e.key === "F2") {
        if (canEdit(current, column)) { e.preventDefault(); setEditing(true); }
      } else if ((e.key === " " || e.key === "o") && onOpen) {
        e.preventDefault();
        onOpen(current);
      } else if ((e.key === "Backspace" || e.key === "Delete") && onDelete) {
        e.preventDefault();
        onDelete(current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const finish = (value: CellValue | undefined, then?: "right" | "left") => {
    setEditing(false);
    if (value !== undefined && current && column) onCommit(current, column.key, value);
    if (then && cursor) move({ row: cursor.row, col: cursor.col + (then === "right" ? 1 : -1) });
  };

  const hl = (column: string) => (text: string) => {
    const ranges = highlight?.(text, column) ?? [];
    if (!ranges.length) return text;
    const parts: React.ReactNode[] = [];
    let i = 0;
    for (const [s, e] of ranges) {
      if (s > i) parts.push(text.slice(i, s));
      parts.push(<mark key={s} className="rounded-[2px] bg-rust-100 text-inherit">{text.slice(s, e)}</mark>);
      i = e;
    }
    if (i < text.length) parts.push(text.slice(i));
    return parts;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-n-100 bg-n-0">
      <table className="w-full min-w-max table-fixed border-separate border-spacing-0 text-[13px]">
        <colgroup>
          {columns.map((c) => <col key={c.key} style={{ width: c.width }} />)}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => {
              const sorted = sort?.field === c.key ? sort.dir : null;
              return (
                <th key={c.key} scope="col" className="border-b border-n-100 p-0 text-left">
                  <button
                    type="button"
                    onClick={() => onSort?.(c.key)}
                    className={clsx(
                      "flex w-full items-center gap-1 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] transition-colors",
                      sorted ? "text-rust-600" : "text-n-400 hover:text-n-600",
                    )}
                  >
                    {c.label}
                    {sorted && <span aria-label={sorted === "asc" ? "ascending" : "descending"}>{sorted === "asc" ? "↑" : "↓"}</span>}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const id = ids[ri];
            const rowActive = cursor?.row === ri;
            return (
              <tr
                key={id}
                ref={(el) => {
                  if (el) rowRefs.current.set(id, el);
                  else rowRefs.current.delete(id);
                }}
                className={clsx("group", rowActive && "bg-n-50")}
              >
                {columns.map((c, ci) => {
                  const active = rowActive && cursor?.col === ci;
                  const locked = !(c.editable?.(r) ?? true);
                  return (
                    <td
                      key={c.key}
                      onMouseDown={() => {
                        if (!active) move({ row: ri, col: ci });
                      }}
                      onDoubleClick={() => {
                        move({ row: ri, col: ci });
                        if (!locked) setEditing(true);
                      }}
                      className={clsx(
                        "relative h-10 border-b border-n-100 px-3 align-middle group-last:border-b-0",
                        active && !editing && "shadow-[inset_0_0_0_1.5px_var(--color-rust-400)]",
                        dim?.(r) && "opacity-60",
                      )}
                    >
                      {active && editing ? (
                        <Editor column={c} row={r} onDone={finish} />
                      ) : (
                        <div className="truncate">{c.render ? c.render(r, hl(c.key)) : hl(c.key)(c.text(r))}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && empty}
    </div>
  );
}

function Editor<R>({ column, row, onDone }: {
  column: Column<R>;
  row: R;
  onDone: (value: CellValue | undefined, then?: "right" | "left") => void;
}) {
  if (column.kind === "select") return <SelectEditor options={column.options?.(row) ?? []} value={column.text(row)} onDone={onDone} />;
  if (column.kind === "date") return <DateEditor initial={column.text(row)} direction={column.direction ?? "future"} onDone={onDone} />;
  return <TextEditor initial={column.text(row)} onDone={onDone} />;
}

const inputClass =
  "absolute inset-0 h-full w-full bg-n-0 px-3 text-[13px] text-n-800 outline-none shadow-[inset_0_0_0_1.5px_var(--color-rust-500)]";

function TextEditor({ initial, onDone }: { initial: string; onDone: (v: CellValue | undefined, then?: "right" | "left") => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (v: CellValue | undefined, then?: "right" | "left") => {
    if (done.current) return;
    done.current = true;
    onDone(v === initial ? undefined : v, then);
  };
  return (
    <input
      autoFocus
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); finish(value); }
        else if (e.key === "Escape") { e.preventDefault(); finish(undefined); }
        else if (e.key === "Tab") { e.preventDefault(); finish(value, e.shiftKey ? "left" : "right"); }
      }}
      spellCheck={false}
      className={inputClass}
    />
  );
}

function DateEditor({ initial, direction, onDone }: {
  initial: string;
  direction: "past" | "future";
  onDone: (v: CellValue | undefined, then?: "right" | "left") => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const parsed = parseDateInput(value, direction);
  const finish = (commit: boolean, then?: "right" | "left") => {
    if (done.current) return;
    if (commit && parsed === undefined) return;
    done.current = true;
    onDone(commit && value !== initial ? (parsed ?? null) : undefined, then);
  };
  return (
    <>
      <input
        autoFocus
        value={value}
        placeholder={direction === "past" ? "fri, 3 oct, yesterday…" : "fri, 3 nov, in 2 weeks…"}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(parsed !== undefined)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); finish(true); }
          else if (e.key === "Escape") { e.preventDefault(); finish(false); }
          else if (e.key === "Tab") { e.preventDefault(); finish(true, e.shiftKey ? "left" : "right"); }
        }}
        spellCheck={false}
        className={clsx(inputClass, "font-num placeholder:text-n-400")}
      />
      {/* What it'll be read as, before it's committed. */}
      <Below className="animate-fade-in whitespace-nowrap rounded-md border border-n-100 bg-n-0 px-2.5 py-1.5 text-[12px] shadow-[var(--shadow-pop)]">
        {parsed === undefined ? (
          <span className="text-danger">Not a date</span>
        ) : parsed === null ? (
          <span className="text-n-500">Clear</span>
        ) : (
          <span className="text-n-700">{fmtDayDate(parsed)} {parsed.getFullYear() !== new Date().getFullYear() && parsed.getFullYear()}</span>
        )}
      </Below>
    </>
  );
}

function SelectEditor({ options, value, onDone }: {
  options: Option[];
  value: string;
  onDone: (v: CellValue | undefined, then?: "right" | "left") => void;
}) {
  const [query, setQuery] = useState("");
  const shown = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.label === value || o.value === value)));
  const done = useRef(false);
  const finish = (v: CellValue | undefined, then?: "right" | "left") => {
    if (done.current) return;
    done.current = true;
    onDone(v, then);
  };
  const pick = (i: number, then?: "right" | "left") => {
    const o = shown[i];
    finish(o && o.value !== value && o.label !== value ? o.value : undefined, then);
  };

  return (
    <>
      <input
        autoFocus
        value={query}
        placeholder={value}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onBlur={() => finish(undefined)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(active); }
          else if (e.key === "Tab") { e.preventDefault(); pick(active, e.shiftKey ? "left" : "right"); }
          else if (e.key === "Escape") { e.preventDefault(); finish(undefined); }
        }}
        className={clsx(inputClass, "placeholder:text-n-500")}
      />
      <Below className="animate-scale-in origin-top-left rounded-md border border-n-100 bg-n-0 p-1 shadow-[var(--shadow-pop)]">
      <ul role="listbox">
        {shown.map((o, i) => (
          <li key={o.value}>
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              // mousedown, so the input's blur doesn't close the list first.
              onMouseDown={(e) => { e.preventDefault(); pick(i); }}
              onMouseEnter={() => setActive(i)}
              className={clsx(
                "flex w-full items-center gap-2 whitespace-nowrap rounded px-2.5 py-1.5 text-left text-[12.5px]",
                i === active ? "bg-rust-50 text-rust-700" : "text-n-700",
              )}
            >
              {o.label}
              {(o.value === value || o.label === value) && <span className="ml-auto text-n-400">✓</span>}
            </button>
          </li>
        ))}
        {!shown.length && <li className="px-2.5 py-1.5 text-[12px] text-n-400">No match</li>}
      </ul>
      </Below>
    </>
  );
}

/**
 * A popover under the cell being edited. Portalled, because the table scrolls
 * sideways on a phone and that clipping would cut a picker off at the last
 * row. Placed from the cell's box, and kept there if the page scrolls.
 */
function Below({ className, children }: { className?: string; children: React.ReactNode }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const cell = marker.current?.closest("td");
    if (!cell) return;
    const place = () => {
      const r = cell.getBoundingClientRect();
      setBox({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, []);

  return (
    <>
      <span ref={marker} hidden />
      {box && (
        <Portal>
          <div className={clsx("fixed z-[65]", className)} style={{ left: box.left, top: box.top, minWidth: box.width }}>
            {children}
          </div>
        </Portal>
      )}
    </>
  );
}
