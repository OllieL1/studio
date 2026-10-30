"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildTree, filterItems, visibleRows, type BrowserItem, type FileItem, type NoteItem } from "@/lib/noteTree";
import { fmtAgo } from "@/lib/dates";
import { fmtBytes } from "@/lib/format";
import { clsx } from "@/lib/clsx";
import { Card, EmptyState } from "../ui";

export type BrowserView = "gallery" | "tree";

/** Read and write browser storage without ever throwing - private windows,
 *  blocked site data and previews all just fall back to the default. */
const stored = {
  get(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { window.localStorage.setItem(key, value); } catch { /* not remembered, still works */ }
  },
};

/**
 * Gallery or tree, remembered per place (Nexus, tasks). The first render is
 * always the default so the server and browser agree; a remembered choice
 * takes over straight after.
 */
export function useStoredView(storageKey: string, defaultView: BrowserView) {
  const [view, setView] = useState<BrowserView>(defaultView);
  useEffect(() => {
    const saved = stored.get(storageKey);
    if (saved === "gallery" || saved === "tree") setView(saved);
  }, [storageKey]);
  const change = (next: BrowserView) => {
    setView(next);
    stored.set(storageKey, next);
  };
  return [view, change] as const;
}

/**
 * Notes - and, on a task, its uploaded files - as a gallery of cards or a
 * file tree whose folders are tags. Search and the tag chips filter both the
 * same way. Used by Nexus (gallery first) and the task page (tree first).
 */
export function NotesBrowser({
  items,
  tags,
  noteHref,
  view,
  onViewChange,
  storageKey,
  onNew,
  creating,
  actions,
  onRemoveFile,
  empty,
}: {
  items: BrowserItem[];
  /** The tag chips. */
  tags: string[];
  noteHref: (id: string) => string;
  view: BrowserView;
  onViewChange: (view: BrowserView) => void;
  /** Where the tree's collapsed folders are remembered. */
  storageKey: string;
  onNew: () => void;
  creating: boolean;
  /** More toolbar buttons, after New note. */
  actions?: React.ReactNode;
  onRemoveFile?: (file: FileItem) => void;
  empty: { title: string; body: string };
}) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  const shown = useMemo(() => filterItems(items, query, tag), [items, query, tag]);
  const notes = shown.filter((i): i is NoteItem => i.kind === "note");
  const files = shown.length - notes.length;
  const filtered = query.trim().length > 0 || tag !== null;

  const count = [
    notes.length > 0 || files === 0 ? `${notes.length} note${notes.length === 1 ? "" : "s"}` : null,
    files > 0 ? `${files} file${files === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onNew}
          disabled={creating}
          className="flex h-8 items-center rounded-md bg-rust-500 px-3 text-[12.5px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600 disabled:opacity-50"
        >
          {creating ? "Creating…" : "+ New note"}
        </button>
        {actions}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={files > 0 || items.some((i) => i.kind === "file") ? "Search notes and files" : "Search notes"}
          aria-label="Search"
          className="h-8 w-[220px] rounded-md border border-n-200 bg-n-0 px-2.5 text-[12.5px] outline-none focus:border-rust-400"
        />
        {notes.length > 0 && (
          <a
            href={`/api/project/notes/pdf?ids=${notes.map((n) => n.id).join(",")}`}
            target="_blank"
            rel="noreferrer"
            title={filtered ? "Export the notes shown" : "Export every note"}
            className="flex h-8 items-center rounded-md border border-n-200 bg-n-0 px-2.5 text-[12.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50"
          >
            PDF
          </a>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag((cur) => (cur === t ? null : t))}
              aria-pressed={tag === t}
              className={clsx(
                "flex h-7 items-center rounded-full border px-2.5 text-[11.5px] font-medium transition-colors duration-[120ms]",
                tag === t
                  ? "border-transparent bg-n-800 text-n-0"
                  : "border-n-200 text-n-600 hover:bg-n-50",
              )}
            >
              #{t}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-num text-[11.5px] text-n-400">{count}</span>
          <div className="flex h-8 items-center gap-0.5 rounded-md border border-n-200 bg-n-0 p-0.5" role="group" aria-label="View">
            {([["Gallery", "gallery"], ["Tree", "tree"]] as const).map(([label, mode]) => (
              <button
                key={mode}
                onClick={() => onViewChange(mode)}
                aria-pressed={view === mode}
                className={clsx(
                  "flex h-full items-center rounded-[5px] px-2 text-[11px] font-semibold transition-colors duration-[120ms]",
                  view === mode ? "bg-rust-500 text-white" : "text-n-500 hover:bg-n-50 hover:text-n-800",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            title={items.length === 0 ? empty.title : "Nothing matches."}
            body={items.length === 0 ? empty.body : "Try a different search, or clear the tag filter."}
          />
        </Card>
      ) : view === "gallery" ? (
        <Gallery items={shown} noteHref={noteHref} onRemoveFile={onRemoveFile} />
      ) : (
        <TreeView items={shown} noteHref={noteHref} onRemoveFile={onRemoveFile} storageKey={storageKey} />
      )}
    </div>
  );
}

/* ── Files ───────────────────────────────────────────────────────────────── */

const fileHref = (f: FileItem) => `/api/uploads/${f.id}`;

/** A PDF opens in a tab; a deck or document downloads - a browser can't show it. */
const fileLinkProps = (f: FileItem) =>
  f.ext === "pdf" ? { target: "_blank", rel: "noreferrer" } : { download: f.filename };

const BADGE: Record<string, string> = {
  pdf: "bg-danger-soft text-danger",
  docx: "bg-info-soft text-info",
  pptx: "bg-warn-soft text-warn",
};

function FileBadge({ ext }: { ext: string }) {
  return (
    <span className={clsx("font-num shrink-0 rounded px-1 py-px text-[9.5px] font-semibold uppercase", BADGE[ext] ?? "bg-n-100 text-n-600")}>
      {ext}
    </span>
  );
}

function RemoveButton({ file, onRemove }: { file: FileItem; onRemove: (f: FileItem) => void }) {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove(file);
      }}
      aria-label={`Remove ${file.filename}`}
      className="shrink-0 rounded p-1 text-n-300 opacity-0 transition-all duration-[120ms] hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/* ── Gallery ─────────────────────────────────────────────────────────────── */

function Gallery({
  items,
  noteHref,
  onRemoveFile,
}: {
  items: BrowserItem[];
  noteHref: (id: string) => string;
  onRemoveFile?: (f: FileItem) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((n) =>
        n.kind === "note" ? (
          <Link
            key={n.id}
            href={noteHref(n.id) as Route}
            className="card group flex min-h-[132px] flex-col p-4 transition-colors duration-[120ms] hover:border-n-200 hover:bg-n-25"
          >
            <div className="flex items-baseline gap-2">
              <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-n-800 group-hover:text-rust-700">
                {n.title}
              </h3>
              {n.pinned && (
                <span aria-label="Pinned" title="Pinned" className="shrink-0 text-[11px] text-rust-500">
                  ●
                </span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-3 flex-1 text-[12px] leading-[18px] text-n-500">
              {n.excerpt || "Empty note."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {n.tags.slice(0, 3).map((t) => (
                <span key={t} className="rounded-full bg-info-soft px-1.5 py-px text-[10.5px] font-medium text-info">
                  #{t}
                </span>
              ))}
              <span className="font-num ml-auto text-[10.5px] text-n-400">{fmtAgo(n.updatedAt)}</span>
            </div>
          </Link>
        ) : (
          <a
            key={n.id}
            href={fileHref(n)}
            {...fileLinkProps(n)}
            className="card group flex min-h-[132px] flex-col p-4 transition-colors duration-[120ms] hover:border-n-200 hover:bg-n-25"
          >
            <div className="flex items-baseline gap-2">
              <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-n-800 group-hover:text-rust-700" title={n.filename}>
                {n.filename}
              </h3>
              {onRemoveFile && <RemoveButton file={n} onRemove={onRemoveFile} />}
            </div>
            <p className="mt-1.5 flex-1 text-[12px] leading-[18px] text-n-500">
              {n.ext === "pdf" ? "Opens in a new tab." : "Downloads to open."}
            </p>
            <div className="mt-3 flex items-center gap-1.5">
              <FileBadge ext={n.ext} />
              <span className="font-num text-[10.5px] text-n-400">{fmtBytes(n.size)}</span>
              <span className="font-num ml-auto text-[10.5px] text-n-400">{fmtAgo(n.createdAt)}</span>
            </div>
          </a>
        ),
      )}
    </div>
  );
}

/* ── Tree ────────────────────────────────────────────────────────────────── */

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0 text-n-400">
      {open ? (
        <path d="M1.5 3.5v7h9.5l1.5-5H4L2.5 10.5M1.5 3.5h4l1 1.2h4.5v.8" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      ) : (
        <path d="M1.5 3.5h4l1 1.2h6v6.3h-11v-7.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="shrink-0 text-n-400">
      <path d="M3 1.5h4l2 2v7H3v-9Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M7 1.5v2h2M4.5 6h3M4.5 8h3" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * An explorer: tags as folders, notes and files as rows. With the tree
 * focused, ↑↓ (or j/k) move, ←→ fold and unfold, Enter opens.
 */
function TreeView({
  items,
  noteHref,
  onRemoveFile,
  storageKey,
}: {
  items: BrowserItem[];
  noteHref: (id: string) => string;
  onRemoveFile?: (f: FileItem) => void;
  storageKey: string;
}) {
  const collapsedKey = `${storageKey}.collapsed`;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const saved = JSON.parse(stored.get(collapsedKey) ?? "[]");
      if (Array.isArray(saved)) setCollapsed(new Set(saved.filter((k) => typeof k === "string")));
    } catch {
      // A mangled value just means everything starts open.
    }
  }, [collapsedKey]);

  const toggle = (key: string, open?: boolean) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      const shouldOpen = open ?? next.has(key);
      if (shouldOpen) next.delete(key);
      else next.add(key);
      stored.set(collapsedKey, JSON.stringify([...next]));
      return next;
    });

  const tree = useMemo(() => buildTree(items), [items]);
  const rows = useMemo(() => visibleRows(tree, collapsed), [tree, collapsed]);

  const [active, setActive] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const at = rows.findIndex((r) => r.key === active);

  const rowEl = (key: string) => box.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(key)}"]`);
  const moveTo = (i: number) => {
    const row = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (!row) return;
    setActive(row.key);
    rowEl(row.key)?.scrollIntoView({ block: "nearest" });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const row = rows[at];
    switch (e.key) {
      case "ArrowDown": case "j": e.preventDefault(); return moveTo(at + 1);
      case "ArrowUp": case "k": e.preventDefault(); return moveTo(at < 0 ? 0 : at - 1);
      case "ArrowRight":
        if (row?.type === "folder" && !row.open) { e.preventDefault(); toggle(row.key, true); }
        return;
      case "ArrowLeft":
        if (row?.type === "folder" && row.open) { e.preventDefault(); toggle(row.key, false); }
        else if (row?.type === "item" && row.depth === 1) {
          // From inside a folder, ← goes up to the folder.
          e.preventDefault();
          setActive(row.key.slice(0, row.key.indexOf("/")));
        }
        return;
      case "Enter":
        if (!row) return;
        e.preventDefault();
        if (row.type === "folder") toggle(row.key);
        else rowEl(row.key)?.click();
        return;
    }
  };

  return (
    <div
      ref={box}
      role="tree"
      aria-label="Notes and files"
      tabIndex={0}
      onKeyDown={onKey}
      onFocus={() => { if (!active && rows[0]) setActive(rows[0].key); }}
      className="card py-1.5 outline-none focus-visible:ring-1 focus-visible:ring-rust-300"
    >
      {rows.map((row) => {
        const isActive = row.key === active;
        const rowClass = clsx(
          "group flex h-8 items-center gap-2 pr-3 text-[12.5px] transition-colors duration-[120ms]",
          isActive ? "bg-rust-50" : "hover:bg-n-25",
        );

        if (row.type === "folder") {
          return (
            <button
              key={row.key}
              data-row={row.key}
              role="treeitem"
              aria-level={1}
              aria-expanded={row.open}
              aria-selected={isActive}
              tabIndex={-1}
              onClick={() => { setActive(row.key); toggle(row.key); }}
              className={clsx(rowClass, "w-full pl-3 text-left")}
            >
              <span aria-hidden className={clsx("w-2.5 shrink-0 text-[9px] text-n-400 transition-transform duration-[120ms]", row.open && "rotate-90")}>
                ▶
              </span>
              <FolderIcon open={row.open} />
              <span className="min-w-0 flex-1 truncate font-medium text-n-700">#{row.tag}</span>
              <span className="font-num text-[11px] text-n-400">{row.count}</span>
            </button>
          );
        }

        const item = row.item;
        const indent = row.depth === 1;
        const inner = (
          <>
            {indent && <span aria-hidden className="ml-[17px] h-full w-px shrink-0 bg-n-100" />}
            <span aria-hidden className="w-2.5 shrink-0" />
            {item.kind === "note" ? <DocIcon /> : <FileBadge ext={item.ext} />}
            <span className={clsx("min-w-0 flex-1 truncate", isActive ? "text-rust-700" : "text-n-800 group-hover:text-rust-700")}>
              {item.kind === "note" ? item.title : item.filename}
            </span>
            {item.kind === "note" && item.pinned && (
              <span aria-label="Pinned" title="Pinned" className="shrink-0 text-[10px] text-rust-500">●</span>
            )}
            <span className="font-num shrink-0 text-[11px] text-n-400">
              {item.kind === "note" ? fmtAgo(item.updatedAt) : fmtBytes(item.size)}
            </span>
            {item.kind === "file" && onRemoveFile && <RemoveButton file={item} onRemove={onRemoveFile} />}
          </>
        );
        const common = {
          "data-row": row.key,
          role: "treeitem",
          "aria-level": indent ? 2 : 1,
          "aria-selected": isActive,
          tabIndex: -1,
          onClick: () => setActive(row.key),
          className: clsx(rowClass, indent ? "pl-0" : "pl-3"),
        } as const;

        return item.kind === "note" ? (
          <Link key={row.key} href={noteHref(item.id) as Route} {...common}>
            {inner}
          </Link>
        ) : (
          <a key={row.key} href={fileHref(item)} {...fileLinkProps(item)} {...common}>
            {inner}
          </a>
        );
      })}
    </div>
  );
}
