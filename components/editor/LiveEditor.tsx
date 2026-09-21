"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveNotes } from "@/app/actions";
import {
  applyInsert, caretLine, filterInserts, joinBlocks, listContinuation,
  classify, newId, retype, sourceOffset, splitBlocks, type Block, type Insert,
} from "@/lib/editor/blocks";
import { clsx } from "@/lib/clsx";
import { InsertMenu } from "./InsertMenu";
import { TableEditor } from "./TableEditor";

/**
 * The writing surface: markdown that renders as you leave each block.
 *
 * The note is one markdown string, split into blocks. The block the caret is
 * in is a plain textarea showing raw markdown; every other block shows its
 * rendered HTML. Rendering happens on the server (/api/render) so the editor,
 * the exported PDF and the printed page can never drift apart - and because
 * only the block you just left is re-rendered, typing never waits on it.
 *
 * Saving is a debounce plus every blur, and a save is forced before the tab
 * can close. Losing notes is the worst thing this app could do.
 */

type Props = {
  taskId: string;
  initial: string;
  /** Server-rendered HTML for the initial blocks, in order. */
  initialHtml: string[];
  minimal?: boolean;
  /** Raw markdown mode is owned by the workspace, which renders the control. */
  raw: boolean;
  onRawChange: (raw: boolean) => void;
  onSavedChange?: (saved: boolean) => void;
  placeholder?: string;
};

export function LiveEditor({ taskId, initial, initialHtml, minimal = false, raw, onRawChange, onSavedChange, placeholder }: Props) {
  // One split, used for both: splitting twice would mint different ids and the
  // server-rendered HTML would key against blocks that no longer exist.
  const [start] = useState(() => {
    const bs = splitBlocks(initial);
    return { blocks: bs, html: Object.fromEntries(bs.map((b, i) => [b.id, initialHtml[i] ?? ""])) };
  });
  const [blocks, setBlocks] = useState<Block[]>(start.blocks);
  const [html, setHtml] = useState<Record<string, string>>(start.html);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rawText, setRawText] = useState(initial);
  /** Block indices, inclusive, when several blocks are selected at once. */
  const [selection, setSelection] = useState<{ from: number; to: number } | null>(null);
  const [menu, setMenu] = useState<{ blockId: string; start: number; query: string } | null>(null);

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const rawRef = useRef<HTMLTextAreaElement>(null);
  const caretTarget = useRef<number | null>(null);
  /** Index of the block a selection extends from - the last one edited. */
  const anchorRef = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initial);

  const markdown = useMemo(() => (raw ? rawText : joinBlocks(blocks)), [raw, rawText, blocks]);

  /**
   * The blocks array lives in a ref as well as in state.
   *
   * Every edit path - typing, Enter, blur, the insert menu - can fire before
   * React has re-rendered, and reading `blocks` in those handlers would see
   * the previous value: that's how an emptied list item or a stale render
   * creeps back in. The ref is the source of truth; state exists to paint.
   */
  const blocksRef = useRef(blocks);
  const commit = useCallback((next: Block[]) => {
    blocksRef.current = next;
    setBlocks(next);
  }, []);

  /* ── Saving ───────────────────────────────────────────────────────────── */

  const persist = useCallback(
    async (text: string) => {
      if (text === lastSaved.current) return;
      await saveNotes(taskId, text);
      lastSaved.current = text;
      onSavedChange?.(true);
    },
    [taskId, onSavedChange],
  );

  useEffect(() => {
    const dirty = markdown !== lastSaved.current;
    onSavedChange?.(!dirty);
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(markdown), 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [markdown, persist, onSavedChange]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (markdown !== lastSaved.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [markdown]);

  /* ── Rendering ────────────────────────────────────────────────────────── */

  const render = useCallback(async (targets: Block[]) => {
    const wanted = targets.filter((b) => b.text.trim());
    if (wanted.length === 0) {
      setHtml((h) => ({ ...h, ...Object.fromEntries(targets.map((b) => [b.id, ""])) }));
      return;
    }
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: wanted.map((b) => b.text) }),
      });
      const data = await res.json();
      if (!Array.isArray(data.html)) return;
      setHtml((h) => ({ ...h, ...Object.fromEntries(wanted.map((b, i) => [b.id, data.html[i] ?? ""])) }));
    } catch {
      // Leaving the previous HTML up is better than blanking the note.
    }
  }, []);

  /* ── Moving between blocks ────────────────────────────────────────────── */

  /**
   * Leaving a block re-splits it. Typing a table under a bullet, or pasting
   * several paragraphs, turns one block into several - without this they'd
   * stay glued together and render as one malformed block.
   */
  const settle = useCallback(
    (id: string) => {
      const current = blocksRef.current.find((b) => b.id === id);
      if (!current) return;

      const parts = splitBlocks(current.text);
      if (parts.length <= 1) {
        void render([current]);
        return;
      }
      // Keep the first part's id so focus and scroll position survive.
      const replacement = parts.map((p, n) => (n === 0 ? { ...p, id } : p));
      commit(blocksRef.current.flatMap((b) => (b.id === id ? replacement : [b])));
      void render(replacement);
    },
    [render, commit],
  );

  const focusBlock = (id: string | null, caret?: number) => {
    if (activeId && activeId !== id) settle(activeId);
    anchorRef.current = id ? blocksRef.current.findIndex((b) => b.id === id) : null;
    caretTarget.current = caret ?? null;
    setActiveId(id);
    setMenu(null);
  };

  // Put the caret where the caller asked once the textarea exists.
  useEffect(() => {
    const el = areaRef.current;
    if (!el || activeId === null) return;
    el.focus({ preventScroll: true });
    const at = caretTarget.current ?? el.value.length;
    const pos = at < 0 ? el.value.length : Math.min(at, el.value.length);
    el.setSelectionRange(pos, pos);
    caretTarget.current = null;
    autosize(el);
  }, [activeId]);

  const update = (id: string, text: string) =>
    commit(blocksRef.current.map((b) => (b.id === id ? retype({ ...b, text }) : b)));

  /**
   * Programmatic edits (list continuation, Tab, the insert menu) write to the
   * textarea itself and then sync state. Setting state first and moving the
   * caret afterwards loses characters: keystrokes that land in between get
   * re-ordered around the caret jump.
   */
  const write = (el: HTMLTextAreaElement, id: string, text: string, caret: number) => {
    el.value = text;
    el.setSelectionRange(caret, caret);
    autosize(el);
    update(id, text);
  };

  const insertAfter = (id: string, text = "") => {
    const fresh: Block = { id: newId(), text, kind: classify(text) };
    const bs = blocksRef.current;
    const i = bs.findIndex((b) => b.id === id);
    commit([...bs.slice(0, i + 1), fresh, ...bs.slice(i + 1)]);
    focusBlock(fresh.id, 0);
  };

  const mergeBack = (id: string) => {
    const bs = blocksRef.current;
    const i = bs.findIndex((b) => b.id === id);
    if (i <= 0) return;
    const prev = bs[i - 1];
    const caret = prev.text.length;
    commit([...bs.slice(0, i - 1), retype({ ...prev, text: prev.text + bs[i].text }), ...bs.slice(i + 1)]);
    focusBlock(prev.id, caret);
  };

  /* ── Selecting several blocks ─────────────────────────────────────────── */

  const selectedRange = useMemo(() => {
    if (!selection) return null;
    return { from: Math.min(selection.from, selection.to), to: Math.max(selection.from, selection.to) };
  }, [selection]);

  const selectedMarkdown = () => {
    if (!selectedRange) return "";
    return joinBlocks(blocksRef.current.slice(selectedRange.from, selectedRange.to + 1));
  };

  const selectBlocks = (from: number, to: number) => {
    anchorRef.current = from;
    setSelection({ from, to });
    setActiveId(null);
    setMenu(null);
    // A DOM selection would fight the block highlight.
    window.getSelection()?.removeAllRanges();
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const deleteSelection = () => {
    if (!selectedRange) return;
    const bs = blocksRef.current;
    const rest = [...bs.slice(0, selectedRange.from), ...bs.slice(selectedRange.to + 1)];
    const next = rest.length > 0 ? rest : splitBlocks("");
    commit(next);
    setSelection(null);
    const landing = next[Math.max(0, selectedRange.from - 1)];
    if (landing) focusBlock(landing.id, -1);
  };

  // While blocks are selected the keyboard belongs to the selection.
  useEffect(() => {
    if (!selectedRange) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Caps Lock (and some automation) report "C" rather than "c".
      const key = e.key.toLowerCase();
      if (e.key === "Escape") {
        setSelection(null);
        return;
      }
      if (mod && key === "a") {
        e.preventDefault();
        setSelection({ from: 0, to: blocksRef.current.length - 1 });
        return;
      }
      if (mod && (key === "c" || key === "x")) {
        e.preventDefault();
        void navigator.clipboard?.writeText(selectedMarkdown());
        if (key === "x") deleteSelection();
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const last = blocksRef.current.length - 1;
        const head = e.key === "ArrowUp" ? Math.max(0, selection!.to - 1) : Math.min(last, selection!.to + 1);
        if (e.shiftKey) setSelection({ from: selection!.from, to: head });
        else {
          setSelection(null);
          focusBlock(blocksRef.current[head].id, 0);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRange, selection]);

  /* ── Keys inside a block ──────────────────────────────────────────────── */

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, b: Block) => {
    const el = e.currentTarget;
    const caret = el.selectionStart;
    const mod = e.metaKey || e.ctrlKey;

    if (menu) {
      // The menu owns the arrow keys and Enter while it's open.
      if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) return;
    }

    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void persist(markdown);
      return;
    }

    if (mod && e.key.toLowerCase() === "a") {
      // First press takes the block, a second takes the whole note - the same
      // escalation every editor uses.
      const whole = el.selectionStart === 0 && el.selectionEnd === el.value.length;
      if (whole || !el.value) {
        e.preventDefault();
        settle(b.id);
        selectBlocks(0, blocksRef.current.length - 1);
      }
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      write(el, b.id, `${el.value.slice(0, caret)}  ${el.value.slice(el.selectionEnd)}`, caret + 2);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      // Code and tables are multi-line by nature; ⌘Enter leaves them.
      if ((b.kind === "code" || b.kind === "table") && !mod) return;
      if (mod) {
        e.preventDefault();
        insertAfter(b.id);
        return;
      }

      const cont = listContinuation(el.value, caret);
      if (cont && "insert" in cont) {
        e.preventDefault();
        write(el, b.id, el.value.slice(0, caret) + cont.insert + el.value.slice(caret), caret + cont.insert.length);
        return;
      }
      if (cont && "exit" in cont) {
        e.preventDefault();
        update(b.id, cont.text.replace(/\n$/, ""));
        insertAfter(b.id);
        return;
      }

      e.preventDefault();
      // Split at the caret: the tail becomes the next block.
      const head = el.value.slice(0, caret);
      const tail = el.value.slice(caret);
      update(b.id, head);
      insertAfter(b.id, tail);
      return;
    }

    if (e.key === "Backspace" && caret === 0 && el.selectionEnd === 0) {
      const i = blocksRef.current.findIndex((x) => x.id === b.id);
      if (i > 0) {
        e.preventDefault();
        mergeBack(b.id);
      }
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const { line, lines } = caretLine(el.value, caret);
      const bs = blocksRef.current;
      const i = bs.findIndex((x) => x.id === b.id);

      if (e.shiftKey && ((e.key === "ArrowUp" && line === 0) || (e.key === "ArrowDown" && line === lines - 1))) {
        e.preventDefault();
        settle(b.id);
        const to = e.key === "ArrowUp" ? Math.max(0, i - 1) : Math.min(bs.length - 1, i + 1);
        selectBlocks(i, to);
        return;
      }

      if (e.key === "ArrowUp" && line === 0 && i > 0) {
        e.preventDefault();
        focusBlock(bs[i - 1].id, -1);
      }
      if (e.key === "ArrowDown" && line === lines - 1 && i < bs.length - 1) {
        e.preventDefault();
        focusBlock(bs[i + 1].id, 0);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      focusBlock(null);
      el.blur();
    }
  };

  /** `[` opens the insert menu, when it starts a word rather than a link. */
  const onInput = (e: React.FormEvent<HTMLTextAreaElement>, b: Block) => {
    const el = e.currentTarget;
    const caret = el.selectionStart;
    const text = el.value;
    update(b.id, text);
    autosize(el);

    if (menu) {
      if (caret < menu.start + 1) {
        setMenu(null);
        return;
      }
      setMenu({ ...menu, query: text.slice(menu.start + 1, caret) });
      return;
    }

    const typed = text[caret - 1];
    const before = text[caret - 2];
    if (typed === "[" && (before === undefined || /[\s(]/.test(before))) {
      setMenu({ blockId: b.id, start: caret - 1, query: "" });
    }
  };

  const chooseInsert = (insert: Insert) => {
    const el = areaRef.current;
    if (!el || !menu) return;
    const id = menu.blockId;
    const before = el.value.slice(0, menu.start);
    const lineSoFar = before.slice(before.lastIndexOf("\n") + 1);

    setMenu(null);

    // A table, quote or heading can't share a line with what's already there,
    // so when the line isn't empty the insert starts a block of its own.
    if (insert.block && lineSoFar.trim()) {
      const body = insert.snippet.replace("|", "");
      const offset = insert.snippet.indexOf("|");
      write(el, id, (before + el.value.slice(el.selectionStart)).replace(/[ \t]+$/, ""), before.length);
      settle(id);
      insertAfter(id, body);
      const fresh = blocksRef.current[blocksRef.current.findIndex((b) => b.id === id) + 1];
      if (fresh) caretTarget.current = offset === -1 ? body.length : offset;
      return;
    }

    const { text, caret } = applyInsert(el.value, menu.start, el.selectionStart, insert);
    write(el, id, text, caret);
    if (insert.key === "table") {
      // Re-enter the block so it opens as a grid rather than as pipes.
      setActiveId(null);
      requestAnimationFrame(() => focusBlock(id, 0));
      return;
    }
    el.focus();
  };

  /* ── Raw mode ─────────────────────────────────────────────────────────── */

  // Switching modes converts in whichever direction is needed; the markdown
  // is the only thing that crosses between them.
  const wasRaw = useRef(raw);
  useEffect(() => {
    if (wasRaw.current === raw) return;
    wasRaw.current = raw;
    if (raw) {
      setRawText(joinBlocks(blocksRef.current));
    } else {
      const next = splitBlocks(rawText);
      commit(next);
      setActiveId(null);
      void render(next);
    }
  }, [raw, rawText, render, commit]);

  /* ── Render ───────────────────────────────────────────────────────────── */

  if (raw) {
    return (
      <div className="relative">
        <textarea
          ref={rawRef}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          onBlur={() => void persist(rawText)}
          spellCheck
          className="font-num min-h-[60vh] w-full resize-y bg-transparent p-1 text-[13px] leading-[22px] text-n-800 outline-none"
        />
      </div>
    );
  }

  return (
    <div className={clsx("relative", minimal ? "pb-24" : "pb-10")}>
      {blocks.map((b, i) => (
        <div
          key={b.id}
          data-block={b.kind}
          data-selected={selectedRange ? i >= selectedRange.from && i <= selectedRange.to : undefined}
          className={clsx(
            "rounded-sm",
            selectedRange && i >= selectedRange.from && i <= selectedRange.to && "bg-rust-100/70",
          )}
        >
          {b.id === activeId && b.kind === "table" ? (
            // Tables edit as a grid: pipes are the worst thing about markdown.
            <TableEditor
              markdown={b.text}
              autoFocus
              onChange={(md) => update(b.id, md)}
              onExit={(where) => {
                settle(b.id);
                if (where === "after") insertAfter(b.id);
                else setActiveId(null);
              }}
            />
          ) : b.id === activeId ? (
            <div className="relative">
              <textarea
                ref={areaRef}
                // Uncontrolled while it has focus: a controlled value fights
                // fast typing. `key` remounts it when a different block opens.
                key={b.id}
                defaultValue={b.text}
                onInput={(e) => onInput(e, b)}
                onKeyDown={(e) => onKeyDown(e, b)}
                onBlur={() => {
                  if (menu) return;
                  settle(b.id);
                  setActiveId((id) => (id === b.id ? null : id));
                  void persist(joinBlocks(blocksRef.current));
                }}
                rows={1}
                spellCheck
                placeholder={blocks.length === 1 ? placeholder : undefined}
                className="editor-raw w-full resize-none bg-rust-50/40 px-2 py-1 text-[14.5px] leading-[25px] text-n-800 outline-none placeholder:text-n-400"
              />
              {menu && menu.blockId === b.id && (
                <InsertMenu
                  items={filterInserts(menu.query)}
                  onChoose={chooseInsert}
                  onClose={() => {
                    setMenu(null);
                    areaRef.current?.focus();
                  }}
                />
              )}
            </div>
          ) : (
            <Rendered
              block={b}
              html={html[b.id] ?? ""}
              onExtend={() => {
                if (activeId) settle(activeId);
                const anchor = selection?.from ?? anchorRef.current ?? i;
                setSelection({ from: anchor, to: i });
                setActiveId(null);
                setMenu(null);
                window.getSelection()?.removeAllRanges();
                (document.activeElement as HTMLElement | null)?.blur();
              }}
              onEnter={(caret) => {
                setSelection(null);
                focusBlock(b.id, caret);
              }}
            />
          )}
        </div>
      ))}

      {/* Clicking the space under the note starts a new block, like a page. */}
      <div
        className="min-h-[30vh] cursor-text"
        onMouseDown={(e) => {
          e.preventDefault();
          setSelection(null);
          const last = blocksRef.current[blocksRef.current.length - 1];
          if (last && !last.text.trim()) focusBlock(last.id, 0);
          else if (last) insertAfter(last.id);
        }}
      />
    </div>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

/** A rendered block. Memoised: typing in one block never re-renders the rest. */
const Rendered = memo(function Rendered({
  block,
  html,
  onEnter,
  onExtend,
}: {
  block: Block;
  html: string;
  onEnter: (caret: number) => void;
  /** Shift-click: extend a multi-block selection to here. */
  onExtend: () => void;
}) {
  const empty = !block.text.trim();

  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    // Let a link be a link; otherwise put the caret near what was clicked.
    if ((e.target as HTMLElement).closest("a")) return;
    if (e.shiftKey) return; // handled on mousedown, before the blur
    onEnter(caretFromPoint(e, block.text));
  };

  // Shift-click has to be caught on mousedown: by the time the click fires,
  // the block being edited has already blurred and lost the anchor.
  const mouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    onExtend();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={click}
      onMouseDown={mouseDown}
      onFocus={(e) => {
        // Reached by keyboard: enter at the start.
        if (e.target === e.currentTarget) onEnter(0);
      }}
      className={clsx(
        "prose-notes cursor-text rounded-sm px-2 py-1 transition-colors duration-[120ms] hover:bg-n-25",
        empty && "min-h-[28px]",
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function autosize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Map a click in rendered HTML back to an offset in the block's markdown. */
function caretFromPoint(e: React.MouseEvent<HTMLDivElement>, source: string): number {
  const sel = document.caretPositionFromPoint?.(e.clientX, e.clientY);
  if (!sel) return -1; // -1 means "end of block"
  const container = e.currentTarget;
  let visible = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node === sel.offsetNode) {
      visible += sel.offset;
      return sourceOffset(source, visible);
    }
    visible += node.textContent?.length ?? 0;
  }
  return -1;
}
