"use client";

import type { Route } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createReading, deleteReading, listReading, restoreReading, updateReading,
  type ReadingPatch, type ReadingRow,
} from "@/app/readingActions";
import { linkLabel } from "@/lib/careers";
import { clsx } from "@/lib/clsx";
import { fmtDate, fmtDateLongYear, fmtDayDate } from "@/lib/dates";
import { isTypingTarget, NO_AUTOFILL } from "@/lib/livio/keys";
import { download, drawShareCard, slug } from "@/lib/livio/shareCard";
import {
  highlightRanges, parseQuery, rowMatches, sortRows, viewFromParams, viewToSearch,
  type Field, type Layout, type PageCommand, type ParsedCommand, type View,
} from "@/lib/livio/table";
import {
  dayOf, daysToRead, defaultOrder, isEnded, ratingFromKey, READING_STATUS_LABEL, READING_STATUSES, READING_TYPE_LABEL,
  READING_TYPES, readingStats, stars, toMarkdown, type ReadingStatus, type ReadingType,
} from "@/lib/reading";
import { Eyebrow, Pill } from "../ui";
import { MarkdownField } from "../MarkdownField";
import { CardGrid } from "./CardGrid";
import { CommandBar } from "./CommandBar";
import { DataTable, type CellValue, type Column } from "./DataTable";
import { Drawer } from "./Drawer";
import { FilterMenu } from "./FilterMenu";
import { HelpSheet, type HelpSection } from "./HelpSheet";
import { Kbd } from "./Kbd";
import { Columns } from "./ReadingCharts";
import { Star, Stars } from "./Stars";
import { UndoToast } from "./UndoToast";

const FIELDS: Field[] = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author", aliases: ["by", "writer"] },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "started", label: "Started", aliases: ["start"] },
  { key: "finished", label: "Finished", aliases: ["end", "ended"] },
  { key: "rating", label: "Rating", aliases: ["stars", "enjoyment"] },
  { key: "days", label: "Days", aliases: ["time", "length"] },
  { key: "link", label: "Link", aliases: ["url"] },
  { key: "takeaway", label: "Takeaway", aliases: ["quote"] },
  { key: "notes", label: "Notes" },
];

const COMMANDS: PageCommand[] = [
  { name: "add", hint: "Add a link or a title - a link fills itself in", arg: "link or title" },
  ...READING_TYPES.map((t) => ({ name: READING_TYPE_LABEL[t].toLowerCase(), hint: `Add a ${READING_TYPE_LABEL[t].toLowerCase()}`, arg: "link or title" })),
  { name: "want", hint: "Add to the want-to-read pile", arg: "link or title" },
  { name: "share", hint: "Share card for the one under the cursor (PNG)" },
  { name: "export", hint: "This view as a PDF - or :export md, :export notes", arg: "md | notes" },
  { name: "stats", hint: "Show or hide the charts" },
  { name: "grid", hint: "Cards in a grid - again for the table" },
  { name: "full", hint: "Every column at full width - again to fit" },
  { name: "fit", hint: "Every column on screen" },
  { name: "clear", hint: "Clear search, filters and sort" },
];

const FILTER_KEYS = ["type", "status"];

const HELP: HelpSection[] = [
  {
    title: "Moving",
    rows: [
      [["↑", "↓", "←", "→"], "Move the cursor"],
      [["h", "j", "k", "l"], "…or vim keys"],
      [["g", "G"], "First / last row"],
      [["esc"], "Drop the cursor"],
    ],
  },
  {
    title: "Rows",
    rows: [
      [["↵"], "Edit the cell"],
      [["1", "–", "5"], "Rate it - again for half a star less"],
      [["0"], "Clear the rating"],
      [["space"], "Open: takeaway, notes, share"],
      [["⌘", "↵"], "Follow the link"],
      [["⌫"], "Delete (undo with u)"],
    ],
  },
  {
    title: "Adding",
    rows: [
      [[":add <link>"], "Fills in title, author, type"],
      [[":book Dune"], "Or name the type"],
      [[":want …"], "For later"],
    ],
  },
  {
    title: "Viewing",
    rows: [
      [[":s herbert type:book"], "Search, narrowed by field"],
      [[":f"], "Filter by type and status"],
      [[":^ rating"], "Sort ascending"],
      [[":!^ finished"], "Sort descending"],
      [[":stats"], "Charts"],
      [[":grid", ":full"], "Layouts"],
    ],
  },
  {
    title: "Sharing",
    rows: [
      [[":share"], "A card for the one under the cursor"],
      [[":export"], "This view as a PDF"],
      [[":export md"], "…or as markdown"],
      [[":export notes"], "PDF with notes"],
    ],
  },
];

const STATUS_TONE: Record<ReadingStatus, "neutral" | "ok" | "rust"> = {
  READING: "rust",
  WANT: "neutral",
  FINISHED: "ok",
  ABANDONED: "neutral",
};

const RATING_OPTIONS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map((r) => ({ value: String(r), label: `${stars(r)}  ${r}` }));

function texts(r: ReadingRow): Record<string, string> {
  return {
    title: r.title,
    author: r.author ?? "",
    type: READING_TYPE_LABEL[r.type],
    status: READING_STATUS_LABEL[r.status],
    started: r.startedAt ? fmtDate(r.startedAt) : "",
    finished: r.finishedAt ? fmtDate(r.finishedAt) : "",
    rating: r.rating != null ? String(r.rating) : "",
    link: r.link ?? "",
    takeaway: r.takeaway ?? "",
    notes: r.notesMd ?? "",
  };
}

function sortValue(r: ReadingRow, field: string): string | number | null {
  switch (field) {
    case "status": return READING_STATUSES.indexOf(r.status);
    case "started": return r.startedAt?.getTime() ?? null;
    case "finished": return r.finishedAt?.getTime() ?? null;
    case "rating": return r.rating;
    case "days": return daysToRead(r);
    default: return texts(r)[field] || null;
  }
}

function footnote(r: ReadingRow): string | null {
  const days = daysToRead(r);
  if (r.status === "FINISHED" && r.finishedAt) return `Finished ${fmtDateLongYear(r.finishedAt)}${days ? ` · ${days} ${days === 1 ? "day" : "days"}` : ""}`;
  if (r.status === "READING" && r.startedAt) return `Reading since ${fmtDateLongYear(r.startedAt)}`;
  return null;
}

export function ReadingBoard({ initial }: { initial: ReadingRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [rows, setRows] = useState(initial);
  const [now] = useState(() => new Date());

  const view = useMemo(() => viewFromParams(Object.fromEntries(params), FILTER_KEYS), [params]);
  const [previewQ, setPreviewQ] = useState<string | null>(null);
  const query = useMemo(() => parseQuery(previewQ ?? view.q, FIELDS), [previewQ, view.q]);

  const [command, setCommand] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [focus, setFocus] = useState<{ id: string; column?: string; edit?: boolean; nonce: number } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const cursorRow = useRef<ReadingRow | null>(null);

  const setView = useCallback(
    (next: View) => {
      setFresh(null);
      router.push(`${pathname}${viewToSearch(next)}` as Route, { scroll: false });
    },
    [router, pathname],
  );

  const visible = useMemo(() => {
    const kept = rows.filter((r) => {
      if (r.id === fresh) return true;
      for (const [key, values] of Object.entries(view.filters)) {
        if (values.length && !values.includes(key === "type" ? r.type : r.status)) return false;
      }
      return rowMatches(texts(r), query);
    });
    return view.sort ? sortRows(kept, view.sort, sortValue) : defaultOrder(kept);
  }, [rows, view, query, fresh]);

  const stats = useMemo(() => readingStats(rows, now), [rows, now]);
  const reading = useMemo(() => defaultOrder(rows.filter((r) => r.status === "READING")), [rows]);
  const modal = command !== null || help || filtering || openId !== null;

  useEffect(() => {
    if (modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ":") { e.preventDefault(); setCommand(""); }
      else if (e.key === "/") { e.preventDefault(); setCommand(view.q ? `s ${view.q}` : "s "); }
      else if (e.key === "?") { e.preventDefault(); setHelp(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, view.q]);

  const replaceRow = (row: ReadingRow) => setRows((rs) => rs.map((r) => (r.id === row.id ? row : r)));

  const save = async (row: ReadingRow, patch: ReadingPatch) => {
    setRows((rs) => rs.map((r) => (r.id === row.id ? ({ ...r, ...patch } as ReadingRow) : r)));
    try {
      replaceRow(await updateReading(row.id, patch));
    } catch {
      setRows(await listReading());
    }
  };

  const commit = (row: ReadingRow, column: string, value: CellValue) => {
    const text = typeof value === "string" ? value : "";
    const patch: ReadingPatch =
      column === "started" ? { startedAt: value instanceof Date ? value : null }
      : column === "finished" ? { finishedAt: value instanceof Date ? value : null }
      : column === "rating" ? { rating: text ? Number(text) : null }
      : { [column]: text };
    void save(row, patch);
  };

  const add = async (text: string, type?: ReadingType, status?: ReadingStatus) => {
    setAdding(true);
    try {
      const row = await createReading({ text, type, status });
      setRows((rs) => [row, ...rs]);
      setFresh(row.id);
      // A link filled itself in, so there's nothing to type; otherwise start on what's missing.
      const column = !row.title ? "title" : !row.author ? "author" : undefined;
      setFocus({ id: row.id, column: column ?? "title", edit: !!column && !row.link, nonce: Date.now() });
      if (row.link && !row.title) setToast({ message: "Couldn't read that page - fill the title in by hand" });
    } finally {
      setAdding(false);
    }
  };

  const remove = (row: ReadingRow) => {
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    setOpenId(null);
    void deleteReading(row.id);
    setToast({
      message: `Deleted ${row.title ? `“${row.title}”` : "it"}`,
      undo: async () => {
        setToast(null);
        const back = await restoreReading(row);
        setRows((rs) => [back, ...rs.filter((r) => r.id !== back.id)]);
        setFocus({ id: back.id, nonce: Date.now() });
      },
    });
  };

  const share = async (row: ReadingRow) => {
    const blob = await drawShareCard({
      title: row.title,
      author: row.author,
      typeLabel: READING_TYPE_LABEL[row.type],
      rating: row.rating,
      takeaway: row.takeaway,
      footnote: footnote(row),
    });
    download(blob, `${slug(row.title)}.png`);
    setToast({ message: "Share card saved to Downloads" });
  };

  const exportView = (how: string) => {
    if (!visible.length) return "Nothing in this view to export.";
    if (how === "md" || how === "markdown") {
      download(new Blob([toMarkdown(visible, "Reading list")], { type: "text/markdown" }), "reading-list.md");
      setToast({ message: `${visible.length} exported as markdown` });
      return;
    }
    const q = new URLSearchParams({ ids: visible.map((r) => r.id).join(","), ...(how === "notes" ? { notes: "1" } : {}) });
    window.open(`/api/livio/reading/pdf?${q}`, "_blank", "noopener");
  };

  const run = (cmd: ParsedCommand): string | void => {
    switch (cmd.kind) {
      case "search": return setView({ ...view, q: cmd.query.trim() });
      case "sort": return setView({ ...view, sort: { field: cmd.field!, dir: cmd.dir } });
      case "filter": return void setTimeout(() => setFiltering(true));
      case "help": return void setTimeout(() => setHelp(true));
      case "run": {
        const type = READING_TYPES.find((t) => READING_TYPE_LABEL[t].toLowerCase() === cmd.name);
        if (cmd.name === "add" || type) return void add(cmd.arg, type);
        if (cmd.name === "want") return void add(cmd.arg, undefined, "WANT");
        if (cmd.name === "share") {
          const row = cursorRow.current;
          if (!row) return "Put the cursor on something first.";
          return void share(row);
        }
        if (cmd.name === "export") return exportView(cmd.arg.trim().toLowerCase());
        if (cmd.name === "stats") return setShowStats((v) => !v);
        if (cmd.name === "grid" || cmd.name === "full" || cmd.name === "fit") {
          const layout: Layout = view.layout === cmd.name ? "fit" : cmd.name;
          return setView({ ...view, layout });
        }
        if (cmd.name === "clear") return setView({ q: "", sort: null, filters: {}, hideClosed: false, layout: view.layout });
      }
    }
  };

  /** 1–5 rate, 0 clears - straight from the table or grid. */
  const rowKey = (row: ReadingRow, e: KeyboardEvent): boolean => {
    if (!/^[0-5]$/.test(e.key)) return false;
    void save(row, { rating: ratingFromKey(row.rating, Number(e.key)) });
    return true;
  };

  const toggleSort = (field: string) => {
    const s = view.sort;
    const next = s?.field !== field ? { field, dir: "asc" as const } : s.dir === "asc" ? { field, dir: "desc" as const } : null;
    setView({ ...view, sort: next });
  };

  const hl = (text: string, column: string): React.ReactNode => {
    const ranges = highlightRanges(text, column, query);
    if (!ranges.length) return text;
    const parts: React.ReactNode[] = [];
    let i = 0;
    for (const [a, b] of ranges) {
      if (a > i) parts.push(text.slice(i, a));
      parts.push(<mark key={a} className="rounded-[2px] bg-rust-100 text-inherit">{text.slice(a, b)}</mark>);
      i = b;
    }
    if (i < text.length) parts.push(text.slice(i));
    return parts;
  };

  const columns: Column<ReadingRow>[] = [
    {
      key: "title", label: "Title", width: 260, kind: "text",
      text: (r) => r.title,
      render: (r, h) => r.title ? <span className="font-medium text-n-800">{h(r.title)}</span> : <span className="text-n-300">Title</span>,
    },
    {
      key: "author", label: "Author", width: 150, kind: "text",
      text: (r) => r.author ?? "",
      render: (r, h) => <span className="text-n-600">{r.author ? h(r.author) : ""}</span>,
    },
    {
      key: "type", label: "Type", width: 92, fixed: true, kind: "select",
      text: (r) => READING_TYPE_LABEL[r.type],
      options: () => READING_TYPES.map((t) => ({ value: t, label: READING_TYPE_LABEL[t] })),
      render: (r, h) => <span className="text-n-600">{h(READING_TYPE_LABEL[r.type])}</span>,
    },
    {
      key: "status", label: "Status", width: 128, fixed: true, kind: "select",
      text: (r) => READING_STATUS_LABEL[r.status],
      options: () => READING_STATUSES.map((s) => ({ value: s, label: READING_STATUS_LABEL[s] })),
      render: (r, h) => <Pill tone={STATUS_TONE[r.status]}>{h(READING_STATUS_LABEL[r.status])}</Pill>,
    },
    {
      key: "started", label: "Started", width: 84, fixed: true, kind: "date", direction: "past",
      text: (r) => (r.startedAt ? fmtDate(r.startedAt) : ""),
      render: (r, h) => r.startedAt ? <span className="font-num text-n-600" title={fmtDayDate(r.startedAt)}>{h(fmtDate(r.startedAt))}</span> : <span className="text-n-300">-</span>,
    },
    {
      key: "finished", label: "Finished", width: 88, fixed: true, kind: "date", direction: "past",
      text: (r) => (r.finishedAt ? fmtDate(r.finishedAt) : ""),
      render: (r, h) => {
        if (!r.finishedAt) return <span className="text-n-300">-</span>;
        const days = daysToRead(r);
        return (
          <span className="font-num text-n-600" title={`${fmtDayDate(r.finishedAt)}${days ? ` - ${days} ${days === 1 ? "day" : "days"}` : ""}`}>
            {h(fmtDate(r.finishedAt))}
          </span>
        );
      },
    },
    {
      key: "rating", label: "Rating", width: 92, fixed: true, kind: "select",
      text: (r) => (r.rating != null ? String(r.rating) : ""),
      options: () => [...RATING_OPTIONS, { value: "", label: "No rating" }],
      render: (r) => (r.rating != null ? <Stars value={r.rating} /> : <span className="text-n-300">-</span>),
    },
    {
      key: "link", label: "Link", width: 120, kind: "link",
      text: (r) => r.link ?? "",
      href: (r) => r.link,
      render: (r, h, full) => r.link
        ? <a href={r.link} target="_blank" rel="noreferrer" title={r.link} className="text-rust-600 underline-offset-2 hover:underline">{h(full ? r.link : linkLabel(r.link))}</a>
        : null,
    },
  ];

  const open = rows.find((r) => r.id === openId) ?? null;
  const viewing = view.q || view.sort || Object.values(view.filters).some((v) => v.length) || view.layout !== "fit";
  const empty = (
    <div className="px-6 py-14 text-center">
      {rows.length ? (
        <p className="text-[13px] text-n-500">Nothing matches. <Kbd>:</Kbd> <span className="font-num">clear</span> resets the view.</p>
      ) : (
        <>
          <p className="font-display text-[18px] font-semibold text-n-800">Nothing on the shelf</p>
          <p className="mt-1.5 text-[13px] text-n-500">
            Paste a link below, or press <Kbd>:</Kbd> and type <span className="font-num text-n-700">book Dune</span>.
          </p>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Reading</Eyebrow>
          <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">Reading list</h1>
        </div>
        <p className="flex items-center gap-3 text-[11.5px] text-n-400">
          <span className="flex items-center gap-1.5"><Kbd>:</Kbd> commands</span>
          <span className="flex items-center gap-1.5"><Kbd>?</Kbd> keys</span>
        </p>
      </div>

      <AddLine busy={adding} onAdd={(text) => add(text)} />

      {reading.length > 0 && (
        <section>
          <Eyebrow className="mb-2">Reading now <span className="font-num text-n-400">{reading.length}</span></Eyebrow>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reading.map((r) => {
              const d = dayOf(r.startedAt, now);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setOpenId(r.id)}
                  className="card group flex flex-col items-start p-4 text-left transition-colors duration-[120ms] hover:border-rust-200"
                >
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-400">{READING_TYPE_LABEL[r.type]}</span>
                  <span className="font-display mt-0.5 line-clamp-2 text-[17px] leading-[22px] font-semibold text-n-900">{r.title || "Untitled"}</span>
                  {r.author && <span className="mt-0.5 truncate text-[12.5px] text-n-500">{r.author}</span>}
                  {d && (
                    <span className="mt-3 text-[12px] text-n-500">
                      <span className="font-num font-semibold text-rust-600">Day {d}</span>
                      {r.startedAt && <> · since {fmtDate(r.startedAt)}</>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <StatsStrip stats={stats} showing={showStats} onToggle={() => setShowStats((v) => !v)} />
      {showStats && (
        <div className="animate-fade-in grid gap-8 rounded-lg border border-n-100 bg-n-0 p-5 sm:grid-cols-2">
          <Columns
            title="Finished, month by month"
            data={stats.perMonth.map((m) => ({ key: m.month.toISOString(), value: m.count }))}
            label={(k) => new Date(k).toLocaleString("en-GB", { month: "narrow" })}
            tooltip={(k, v) => `${new Date(k).toLocaleString("en-GB", { month: "long", year: "numeric" })}: ${v} finished`}
            empty="Nothing finished in the last year yet"
          />
          <Columns
            title="How much you enjoyed them"
            data={stats.ratings.map((r) => ({ key: String(r.rating), value: r.count }))}
            label={(k) => (Number.isInteger(Number(k)) ? `${k}★` : "")}
            tooltip={(k, v) => `${k} stars: ${v}`}
            empty="Rate what you finish - keys 1 to 5"
          />
        </div>
      )}

      {viewing && (
        <div className="flex flex-wrap items-center gap-1.5">
          {view.q && <Chip onClear={() => setView({ ...view, q: "" })}>Search <b className="font-num">{view.q}</b></Chip>}
          {Object.entries(view.filters).map(([k, values]) =>
            values.length ? (
              <Chip key={k} onClear={() => setView({ ...view, filters: { ...view.filters, [k]: [] } })}>
                {k === "type" ? "Type" : "Status"}{" "}
                <b>{values.map((v) => (k === "type" ? READING_TYPE_LABEL[v as ReadingType] : READING_STATUS_LABEL[v as ReadingStatus]) ?? v).join(", ")}</b>
              </Chip>
            ) : null,
          )}
          {view.sort && (
            <Chip onClear={() => setView({ ...view, sort: null })}>
              Sorted by <b>{FIELDS.find((f) => f.key === view.sort!.field)?.label ?? view.sort.field} {view.sort.dir === "asc" ? "↑" : "↓"}</b>
            </Chip>
          )}
          {view.layout !== "fit" && (
            <Chip onClear={() => setView({ ...view, layout: "fit" })}>Layout <b>{view.layout === "grid" ? "Grid" : "Full width"}</b></Chip>
          )}
          <span className="ml-1 font-num text-[11.5px] text-n-400">{visible.length} shown</span>
        </div>
      )}

      {view.layout === "grid" ? (
        <CardGrid
          rows={visible}
          rowId={(r) => r.id}
          card={(r) => <ReadingCard row={r} hl={hl} />}
          onOpen={(r) => setOpenId(r.id)}
          onDelete={remove}
          href={(r) => r.link}
          dim={(r) => r.status === "ABANDONED"}
          keysActive={!modal}
          focus={focus}
          empty={empty}
          onRowKey={rowKey}
          onCursor={(r) => { cursorRow.current = r; }}
        />
      ) : (
        <DataTable
          rows={visible}
          columns={columns}
          rowId={(r) => r.id}
          onCommit={commit}
          onOpen={(r) => setOpenId(r.id)}
          onDelete={remove}
          onSort={toggleSort}
          sort={view.sort}
          dim={(r) => r.status === "ABANDONED"}
          highlight={(text, column) => highlightRanges(text, column, query)}
          keysActive={!modal}
          focus={focus}
          empty={empty}
          layout={view.layout === "full" ? "full" : "fit"}
          onRowKey={rowKey}
          onCursor={(r) => { cursorRow.current = r; }}
        />
      )}

      {command !== null && (
        <CommandBar initial={command} commands={COMMANDS} fields={FIELDS} onRun={run} onPreview={setPreviewQ} onClose={() => setCommand(null)} />
      )}
      {help && <HelpSheet sections={HELP} onClose={() => setHelp(false)} />}
      {filtering && (
        <FilterMenu
          groups={[
            { key: "type", label: "Type", options: READING_TYPES.map((t) => ({ value: t, label: READING_TYPE_LABEL[t], count: rows.filter((r) => r.type === t).length })) },
            { key: "status", label: "Status", options: READING_STATUSES.map((s) => ({ value: s, label: READING_STATUS_LABEL[s], count: rows.filter((r) => r.status === s).length })) },
          ]}
          filters={view.filters}
          hideClosed={false}
          onChange={(filters) => setView({ ...view, filters })}
          onClose={() => setFiltering(false)}
        />
      )}
      {open && (
        <ReadingPanel
          row={open}
          now={now}
          onSave={(patch) => save(open, patch)}
          onShare={() => share(open)}
          onDelete={() => remove(open)}
          onClose={() => setOpenId(null)}
        />
      )}
      {toast && <UndoToast message={toast.message} onUndo={toast.undo} onDone={() => setToast(null)} />}
    </div>
  );
}

/** Paste a link, press Enter - the title, author and type fill themselves in. */
function AddLine({ busy, onAdd }: { busy: boolean; onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const isLink = /^(https?:\/\/|www\.)/i.test(text.trim());
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        await onAdd(text.trim());
        setText("");
      }}
      className="flex items-center gap-3 rounded-lg border border-n-100 bg-n-0 px-4 py-2.5 transition-colors focus-within:border-rust-300"
    >
      <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-n-300 text-n-400">
        <svg width="8" height="8" viewBox="0 0 8 8"><path d="M4 1v6M1 4h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      </span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { setText(""); e.currentTarget.blur(); } }}
        disabled={busy}
        placeholder="Paste a link, or type a title - it starts as Reading"
        {...NO_AUTOFILL}
        className="h-7 min-w-0 flex-1 bg-transparent text-[13.5px] text-n-800 outline-none placeholder:text-n-400"
      />
      {busy ? (
        <span className="text-[11.5px] text-n-400">{isLink ? "Reading the page…" : "Adding…"}</span>
      ) : text.trim() ? (
        <span className="hidden items-center gap-1 text-[11px] text-n-400 sm:flex"><Kbd>↵</Kbd> add</span>
      ) : null}
    </form>
  );
}

function StatsStrip({ stats, showing, onToggle }: { stats: ReturnType<typeof readingStats>; showing: boolean; onToggle: () => void }) {
  const types = stats.byType.map((t) => `${t.count} ${READING_TYPE_LABEL[t.type].toLowerCase()}${t.count === 1 ? "" : "s"}`).join(" · ");
  const cell = "min-w-0 px-5 py-3.5";
  return (
    <div className="grid grid-cols-2 divide-n-100 rounded-lg border border-n-100 bg-n-0 sm:grid-cols-4 sm:divide-x">
      <div className={cell}>
        <Eyebrow>Finished this year</Eyebrow>
        <p className="mt-1 font-num text-[22px] font-semibold leading-7 text-n-900">{stats.finishedThisYear}</p>
      </div>
      <div className={cell}>
        <Eyebrow>Average rating</Eyebrow>
        <p className="mt-1 flex items-center gap-2">
          <span className="font-num text-[22px] font-semibold leading-7 text-n-900">{stats.averageRating != null ? stats.averageRating.toFixed(1) : "-"}</span>
          {stats.averageRating != null && <Stars value={Math.round(stats.averageRating * 2) / 2} size={11} />}
        </p>
      </div>
      <div className={cell}>
        <Eyebrow>Average time</Eyebrow>
        <p className="mt-1 font-num text-[22px] font-semibold leading-7 text-n-900">
          {stats.averageDays != null ? Math.round(stats.averageDays) : "-"}
          {stats.averageDays != null && <span className="ml-1 text-[13px] font-medium text-n-400">days</span>}
        </p>
      </div>
      <div className={clsx(cell, "flex items-end justify-between gap-3")}>
        <div className="min-w-0">
          <Eyebrow>By type</Eyebrow>
          <p className="mt-1 truncate text-[12.5px] leading-7 text-n-600" title={types}>{types || "-"}</p>
        </div>
        <button type="button" onClick={onToggle} className="shrink-0 pb-1 text-[11.5px] font-medium text-rust-600 hover:underline">
          {showing ? "Hide charts" : "Charts"}
        </button>
      </div>
    </div>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-n-200 bg-n-0 py-0.5 pl-2.5 pr-1 text-[12px] text-n-600 [&_b]:font-semibold [&_b]:text-n-800">
      {children}
      <button type="button" onClick={onClear} aria-label="Remove" className="flex h-4 w-4 items-center justify-center rounded-full text-n-400 transition-colors hover:bg-n-100 hover:text-n-700">
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      </button>
    </span>
  );
}

function ReadingCard({ row, hl }: { row: ReadingRow; hl: (text: string, column: string) => React.ReactNode }) {
  const note = footnote(row);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-400">{hl(READING_TYPE_LABEL[row.type], "type")}</p>
        <Pill tone={STATUS_TONE[row.status]} className="shrink-0">{hl(READING_STATUS_LABEL[row.status], "status")}</Pill>
      </div>
      <h3 className="font-display mt-1 line-clamp-2 text-[18px] leading-6 font-semibold text-n-900">
        {row.title ? hl(row.title, "title") : <span className="text-n-300">Untitled</span>}
      </h3>
      {row.author && <p className="truncate text-[13px] text-n-600">{hl(row.author, "author")}</p>}
      {row.takeaway && <p className="mt-2 line-clamp-2 border-l-2 border-rust-200 pl-2.5 text-[12.5px] italic text-n-600">{row.takeaway}</p>}
      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-[12px] text-n-500">
        <span className="truncate">{note}</span>
        {row.rating != null && <Stars value={row.rating} size={11} />}
      </div>
    </div>
  );
}

/** One thing in full: rate it, say what stuck, keep notes, share it. */
function ReadingPanel({ row, now, onSave, onShare, onDelete, onClose }: {
  row: ReadingRow;
  now: Date;
  onSave: (patch: ReadingPatch) => Promise<void>;
  onShare: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [takeaway, setTakeaway] = useState(row.takeaway ?? "");
  const days = daysToRead(row);
  const d = row.status === "READING" ? dayOf(row.startedAt, now) : null;
  return (
    <Drawer label={row.title || "Reading"} onClose={onClose}>
      <div className="border-b border-n-100 px-6 pb-5 pt-6">
        <Eyebrow>{READING_TYPE_LABEL[row.type]}</Eyebrow>
        <h2 className="font-display mt-1 text-[26px] leading-8 font-semibold tracking-tight text-n-900">{row.title || "Untitled"}</h2>
        {row.author && <p className="mt-0.5 text-[14px] text-n-600">{row.author}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill tone={STATUS_TONE[row.status]}>{READING_STATUS_LABEL[row.status]}</Pill>
          {d && <span className="text-[12px] text-n-500">Day {d}</span>}
          {days && row.status === "FINISHED" && <span className="text-[12px] text-n-500">{days} {days === 1 ? "day" : "days"} to read</span>}
        </div>

        <div className="mt-4 flex items-center gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={row.rating != null && Math.ceil(row.rating) === n}
              title={`${n} - click again for ${n - 0.5}`}
              onClick={() => onSave({ rating: ratingFromKey(row.rating, n) })}
              className="rounded p-0.5 transition-transform hover:scale-110"
            >
              <Star fill={(row.rating ?? 0) - (n - 1)} size={20} />
            </button>
          ))}
          {row.rating != null && (
            <button type="button" onClick={() => onSave({ rating: null })} className="ml-2 text-[11.5px] text-n-400 hover:text-n-700">Clear</button>
          )}
        </div>

        {row.link && (
          <a href={row.link} target="_blank" rel="noreferrer" className="mt-4 block break-all text-[12.5px] text-rust-600 underline-offset-2 hover:underline">{row.link}</a>
        )}
      </div>

      <div className="space-y-5 px-6 py-5">
        <label className="block">
          <Eyebrow className="mb-2">Takeaway</Eyebrow>
          <input
            value={takeaway}
            onChange={(e) => setTakeaway(e.target.value)}
            onBlur={() => takeaway !== (row.takeaway ?? "") && onSave({ takeaway })}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            placeholder="The one line worth remembering - the share card quotes it"
            {...NO_AUTOFILL}
            className="w-full rounded-md border border-n-200 bg-n-0 px-3 py-2 text-[13px] italic text-n-800 outline-none transition-colors placeholder:not-italic placeholder:text-n-400 focus:border-rust-400"
          />
        </label>
        <div>
          <Eyebrow className="mb-2">Notes</Eyebrow>
          <MarkdownField initial={row.notesMd ?? ""} save={(notesMd) => onSave({ notesMd })} placeholder="Quotes, thoughts, what to read next…" minHeight={200} />
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-n-100 px-6 py-3">
        <button
          type="button"
          onClick={onShare}
          className="flex items-center gap-1.5 rounded-md bg-rust-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-rust-600"
        >
          Share card
        </button>
        <button type="button" onClick={onDelete} className="rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-n-500 transition-colors hover:bg-danger-soft hover:text-danger">
          Delete
        </button>
      </div>
    </Drawer>
  );
}
