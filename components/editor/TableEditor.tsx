"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addColumn, addRow, nextCell, parseTable, removeColumn, removeRow,
  serializeTable, setAlign, setCell, type Align, type Table,
} from "@/lib/editor/tables";
import { clsx } from "@/lib/clsx";

/**
 * A table edited as a grid rather than as pipes.
 *
 * Every keystroke writes the markdown back out, so the note's source stays the
 * single truth and switching to raw markdown shows exactly this table. Tab
 * walks the cells and adds a row off the end, which is how a table actually
 * gets filled in during a lecture.
 */
export function TableEditor({
  markdown,
  onChange,
  onExit,
  autoFocus,
}: {
  markdown: string;
  onChange: (markdown: string) => void;
  /** Leave the table: `after` continues below it. */
  onExit: (where: "after" | "before") => void;
  autoFocus?: boolean;
}) {
  const blank = useMemo<Table>(() => ({ header: [""], align: ["left"], rows: [[""]] }), []);
  /**
   * The grid keeps its own state rather than re-parsing the markdown on every
   * keystroke. Serialising trims each cell, so a space typed at the end of a
   * cell would be eaten before the next character arrived - "n log n" came out
   * as "nlogn".
   */
  const [table, setTable] = useState<Table>(() => parseTable(markdown) ?? blank);
  const [focus, setFocus] = useState<{ row: number; col: number } | null>(autoFocus ? { row: -1, col: 0 } : null);
  const gridRef = useRef<HTMLTableElement>(null);
  const mine = useRef(markdown);

  // Adopt the markdown when it changes from outside this component.
  useEffect(() => {
    if (markdown === mine.current) return;
    mine.current = markdown;
    setTable(parseTable(markdown) ?? blank);
  }, [markdown, blank]);

  const apply = (t: Table) => {
    setTable(t);
    const md = serializeTable(t);
    mine.current = md;
    onChange(md);
  };

  // Move the caret into whichever cell should have it.
  useEffect(() => {
    if (!focus) return;
    const el = gridRef.current?.querySelector<HTMLInputElement>(
      `[data-cell="${focus.row}:${focus.col}"]`,
    );
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [focus, table.rows.length, table.header.length]);

  const onCellKey = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    const el = e.currentTarget;

    if (e.key === "Tab") {
      e.preventDefault();
      const to = nextCell(table, row, col, e.shiftKey);
      if (to === "append") {
        apply(addRow(table, table.rows.length - 1));
        setFocus({ row: table.rows.length, col: 0 });
      } else {
        setFocus(to);
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        onExit("after");
        return;
      }
      // Enter on the last row leaves the table; elsewhere it drops a row down.
      if (row === table.rows.length - 1) {
        apply(addRow(table, row));
        setFocus({ row: row + 1, col });
      } else {
        setFocus({ row: row + 1, col });
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      onExit("after");
      return;
    }

    if (e.key === "Backspace" && el.value === "" && table.rows.length > 1 && row >= 0) {
      const empty = table.rows[row].every((c) => !c);
      if (empty) {
        e.preventDefault();
        apply(removeRow(table, row));
        setFocus({ row: Math.max(-1, row - 1), col });
      }
      return;
    }

    if (e.key === "ArrowUp" && row > -1) {
      e.preventDefault();
      setFocus({ row: row - 1, col });
    }
    if (e.key === "ArrowDown" && row < table.rows.length - 1) {
      e.preventDefault();
      setFocus({ row: row + 1, col });
    }
  };

  const cell = (value: string, row: number, col: number) => (
    <input
      data-cell={`${row}:${col}`}
      value={value}
      onChange={(e) => apply(setCell(table, row, col, e.target.value))}
      onFocus={() => setFocus({ row, col })}
      onKeyDown={(e) => onCellKey(e, row, col)}
      className={clsx(
        "w-full bg-transparent px-2 py-1.5 text-[13.5px] outline-none",
        row === -1 ? "font-semibold text-n-800" : "text-n-700",
        table.align[col] === "center" && "text-center",
        table.align[col] === "right" && "text-right",
      )}
      placeholder={row === -1 ? "Column" : undefined}
    />
  );

  return (
    <div className="group/table my-1 overflow-hidden rounded-md border border-n-200">
      <table ref={gridRef} className="w-full table-fixed border-collapse">
        <thead>
          <tr className="bg-n-25">
            {table.header.map((h, col) => (
              <th key={col} className="border-b border-r border-n-200 p-0 last:border-r-0 align-middle">
                <div className="flex items-center">
                  {cell(h, -1, col)}
                  <ColumnMenu
                    align={table.align[col]}
                    onAlign={(a) => apply(setAlign(table, col, a))}
                    onAdd={() => apply(addColumn(table, col))}
                    onRemove={() => apply(removeColumn(table, col))}
                  />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="border-b border-n-100 last:border-b-0">
              {row.map((c, col) => (
                <td key={col} className="border-r border-n-100 p-0 last:border-r-0">
                  {cell(c, r, col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-2 border-t border-n-100 bg-n-25 px-2 py-1">
        <button
          onClick={() => {
            apply(addRow(table, table.rows.length - 1));
            setFocus({ row: table.rows.length, col: 0 });
          }}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-n-500 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-800"
        >
          + Row
        </button>
        <button
          onClick={() => apply(addColumn(table, table.header.length - 1))}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-n-500 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-800"
        >
          + Column
        </button>
        <span className="ml-auto text-[10.5px] text-n-400">Tab moves · ⌘↵ leaves the table</span>
      </div>
    </div>
  );
}

function ColumnMenu({
  align,
  onAlign,
  onAdd,
  onRemove,
}: {
  align: Align;
  onAlign: (a: Align) => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Column options"
        className="rounded p-1 text-n-300 opacity-0 transition-all duration-[120ms] hover:bg-n-100 hover:text-n-700 focus-visible:opacity-100 group-hover/table:opacity-100"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="animate-scale-in absolute right-0 top-full z-20 mt-1 w-[150px] rounded-lg border border-n-200 bg-n-0 p-1 shadow-[var(--shadow-pop)]">
            <div className="flex gap-0.5 px-1 pb-1">
              {(["left", "center", "right"] as Align[]).map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    onAlign(a);
                    setOpen(false);
                  }}
                  className={clsx(
                    "flex-1 rounded px-1 py-1 text-[10.5px] font-semibold capitalize transition-colors duration-[120ms]",
                    align === a ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50",
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
            <MenuItem label="Add column right" onClick={() => { onAdd(); setOpen(false); }} />
            <MenuItem label="Delete column" danger onClick={() => { onRemove(); setOpen(false); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "block w-full rounded px-2 py-1.5 text-left text-[12px] font-medium transition-colors duration-[120ms]",
        danger ? "text-danger hover:bg-danger-soft" : "text-n-700 hover:bg-n-50",
      )}
    >
      {label}
    </button>
  );
}
