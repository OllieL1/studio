"use client";

import type { Route } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createSovranoProject, deleteSovranoProject, deleteSovranoSession, listSovrano, renameSovranoProject,
  restoreSovranoSession, setSovranoPaid, setSovranoRate, updateSovranoSession,
  type SovranoPatch, type SovranoProjectRow, type SovranoRow,
} from "@/app/sovranoActions";
import { clsx } from "@/lib/clsx";
import { fmtDate, fmtDayDate, fmtDuration, fmtHM } from "@/lib/dates";
import { NO_AUTOFILL } from "@/lib/livio/keys";
import { download } from "@/lib/livio/shareCard";
import {
  highlightRanges, parseQuery, rowMatches, sortRows, viewFromParams, viewToSearch,
  type Field, type PageCommand, type ParsedCommand, type View,
} from "@/lib/livio/table";
import { pdfTab } from "@/lib/pdfTab";
import {
  fmtHours, fmtUSD, isPlatform, OPEN_SOVRANO_LOG_EVENT, parseRate, PLATFORM_LABEL, PLATFORM_SHORT, PLATFORMS,
  sessionCents, SOVRANO_KEY, sovranoTotals,
} from "@/lib/sovrano";
import { parseDuration } from "@/lib/ultraFocus";
import { Eyebrow } from "../ui";
import { CommandBar } from "./CommandBar";
import { DataTable, type CellValue, type Column } from "./DataTable";
import { FilterMenu } from "./FilterMenu";
import { HelpSheet, type HelpSection } from "./HelpSheet";
import { Kbd } from "./Kbd";
import { isTypingTarget } from "@/lib/livio/keys";
import { UndoToast } from "./UndoToast";

const FIELDS: Field[] = [
  { key: "date", label: "Date", aliases: ["when", "day"] },
  { key: "name", label: "Name", aliases: ["what", "task"] },
  { key: "project", label: "Project" },
  { key: "platform", label: "Platform", aliases: ["via"] },
  { key: "time", label: "Time", aliases: ["minutes", "duration", "hours"] },
  { key: "value", label: "Value", aliases: ["usd", "money", "$"] },
  { key: "paid", label: "Paid" },
];

const COMMANDS: PageCommand[] = [
  { name: "paid", hint: "Mark every unpaid session in this view paid" },
  { name: "unpaid", hint: "Mark every paid session in this view unpaid" },
  { name: "rate", hint: "Hourly rate in USD for the filtered project (or the cursor's)", arg: "24.50" },
  { name: "project", hint: "Add a project - with a rate if you like", arg: "name [rate]" },
  { name: "export", hint: "This view as a PDF - or :export json", arg: "pdf | json" },
  { name: "log", hint: "Stop and log the running session" },
  { name: "full", hint: "Every column at full width - again to fit" },
  { name: "fit", hint: "Every column on screen" },
  { name: "clear", hint: "Clear search, filters and sort" },
];

const FILTER_KEYS = ["project", "platform", "paid"];

const HELP: HelpSection[] = [
  {
    title: "Timing",
    rows: [
      [[SOVRANO_KEY], "Start work - from anywhere, in Livio or Studio"],
      [[SOVRANO_KEY], "…again to stop and log it"],
      [["⌥S"], "Studying pauses work, and work pauses study"],
    ],
  },
  {
    title: "Moving",
    rows: [
      [["↑", "↓", "←", "→"], "Move the cursor"],
      [["h", "j", "k", "l"], "…or vim keys"],
      [["esc"], "Drop the cursor"],
    ],
  },
  {
    title: "Rows",
    rows: [
      [["↵"], "Edit the cell - time only goes down"],
      [["p"], "Paid / unpaid"],
      [["⌫"], "Delete (undo with u)"],
    ],
  },
  {
    title: "Money",
    rows: [
      [[":rate 24.50"], "Rate for the filtered project"],
      [[":paid"], "Everything unpaid in view → paid"],
      [[":unpaid"], "…and back"],
      [[":project Acme 30"], "A new project at $30/h"],
    ],
  },
  {
    title: "Viewing",
    rows: [
      [[":s rubric project:acme"], "Search, narrowed by field"],
      [[":f"], "Filter by project, platform, paid"],
      [[":^ value"], "Sort ascending"],
      [[":export", ":export json"], "This view as a PDF or JSON"],
    ],
  },
];

export function SovranoBoard({ initialSessions, initialProjects }: { initialSessions: SovranoRow[]; initialProjects: SovranoProjectRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [rows, setRows] = useState(initialSessions);
  const [projects, setProjects] = useState(initialProjects);
  const [now] = useState(() => new Date());

  // A session logged from the bar refreshes the page's props - take them in.
  useEffect(() => setRows(initialSessions), [initialSessions]);
  useEffect(() => setProjects(initialProjects), [initialProjects]);

  const view = useMemo(() => viewFromParams(Object.fromEntries(params), FILTER_KEYS), [params]);
  const [previewQ, setPreviewQ] = useState<string | null>(null);
  const query = useMemo(() => parseQuery(previewQ ?? view.q, FIELDS), [previewQ, view.q]);

  const [command, setCommand] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const cursorRow = useRef<SovranoRow | null>(null);

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const projectName = useCallback((id: string) => byId.get(id)?.name ?? "-", [byId]);

  const texts = useCallback(
    (r: SovranoRow): Record<string, string> => {
      const cents = sessionCents(r, byId.get(r.projectId));
      return {
        date: fmtDate(r.startedAt),
        name: r.name,
        project: projectName(r.projectId),
        platform: isPlatform(r.platform) ? PLATFORM_LABEL[r.platform] : r.platform,
        time: fmtDuration(r.minutes),
        value: cents == null ? "" : fmtUSD(cents),
        paid: r.paidAt ? "Paid" : "Unpaid",
      };
    },
    [byId, projectName],
  );

  const setView = useCallback(
    (next: View) => router.push(`${pathname}${viewToSearch(next)}` as Route, { scroll: false }),
    [router, pathname],
  );

  const visible = useMemo(() => {
    const kept = rows.filter((r) => {
      const f = view.filters;
      if (f.project?.length && !f.project.includes(r.projectId)) return false;
      if (f.platform?.length && !f.platform.includes(r.platform)) return false;
      if (f.paid?.length && !f.paid.includes(r.paidAt ? "paid" : "unpaid")) return false;
      return rowMatches(texts(r), query);
    });
    if (!view.sort) return kept; // newest first, as loaded
    return sortRows(kept, view.sort, (r, field) => {
      switch (field) {
        case "date": return r.startedAt.getTime();
        case "time": return r.minutes;
        case "value": return sessionCents(r, byId.get(r.projectId));
        case "paid": return r.paidAt?.getTime() ?? 0;
        default: return texts(r)[field] || null;
      }
    });
  }, [rows, view, query, texts, byId]);

  const totals = useMemo(() => sovranoTotals(rows, projects, now), [rows, projects, now]);
  const viewTotals = useMemo(() => sovranoTotals(visible, projects, now), [visible, projects, now]);
  const modal = command !== null || help || filtering;
  const filtered = view.q || Object.values(view.filters).some((v) => v.length);

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

  /* ── Saving ─────────────────────────────────────────────────────────── */

  const save = async (row: SovranoRow, patch: SovranoPatch) => {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    try {
      const next = await updateSovranoSession(row.id, patch);
      setRows((rs) => rs.map((r) => (r.id === next.id ? next : r)));
    } catch {
      setRows((await listSovrano()).sessions);
    }
  };

  const setPaid = async (ids: string[], paid: boolean) => {
    const res = await setSovranoPaid(ids, paid);
    if (!res.ok) return setToast({ message: res.error });
    setRows(res.rows);
  };

  const commit = (row: SovranoRow, column: string, value: CellValue) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (column === "name") return void save(row, { name: text });
    if (column === "project" && byId.has(text)) {
      if (row.paidAt) return setToast({ message: "That one's paid - mark it unpaid before moving it." });
      return void save(row, { projectId: text });
    }
    if (column === "platform" && isPlatform(text)) return void save(row, { platform: text });
    if (column === "paid") return void setPaid([row.id], text === "paid");
    if (column === "time") {
      const m = parseDuration(text);
      if (m == null) return setToast({ message: `“${text}” isn't a length - try 45, 1h20 or 1:20` });
      if (row.paidAt) return setToast({ message: "That one's paid - mark it unpaid before changing its time." });
      if (m > row.rawMinutes) setToast({ message: `Only ${fmtDuration(row.rawMinutes)} was tracked - it can only go down` });
      return void save(row, { minutes: Math.min(m, row.rawMinutes) });
    }
  };

  const remove = (row: SovranoRow) => {
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    void deleteSovranoSession(row.id);
    setToast({
      message: `Deleted “${row.name}”`,
      undo: async () => {
        setToast(null);
        const back = await restoreSovranoSession(row);
        setRows((rs) => [back, ...rs.filter((r) => r.id !== back.id)].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()));
      },
    });
  };

  const setRate = async (projectId: string, cents: number | null) => {
    setProjects((ps) => ps.map((p) => (p.id === projectId ? { ...p, rateCents: cents } : p)));
    const p = await setSovranoRate(projectId, cents);
    setProjects((ps) => ps.map((x) => (x.id === p.id ? p : x)));
    router.refresh(); // the log dialog's dollar preview reads it too
  };

  /* ── Commands ───────────────────────────────────────────────────────── */

  const exportView = (how: string) => {
    if (!visible.length) return "Nothing in this view to export.";
    const q = new URLSearchParams(filtered ? { ids: visible.map((r) => r.id).join(",") } : {});
    const projectFilter = view.filters.project ?? [];
    const title = projectFilter.length === 1 ? `Sovrano · ${projectName(projectFilter[0])}` : "Sovrano work log";
    q.set("title", title);
    if (how === "json") {
      q.set("format", "json");
      // Through the route rather than built here, so the file matches the PDF's numbers exactly.
      fetch(`/api/livio/sovrano/export?${q}`)
        .then((r) => r.blob())
        .then((b) => {
          download(b, `sovrano-${new Date().toISOString().slice(0, 10)}.json`);
          setToast({ message: `${visible.length} ${visible.length === 1 ? "session" : "sessions"} exported as JSON` });
        });
      return;
    }
    if (how && how !== "pdf") return "Export as pdf or json.";
    q.set("format", "pdf");
    window.open(pdfTab(`/api/livio/sovrano/export?${q}`, title), "_blank", "noopener");
  };

  /** The project a command means: the one filtered to, else the cursor's. */
  const targetProject = (): SovranoProjectRow | null => {
    const f = view.filters.project ?? [];
    if (f.length === 1) return byId.get(f[0]) ?? null;
    return cursorRow.current ? byId.get(cursorRow.current.projectId) ?? null : null;
  };

  const run = (cmd: ParsedCommand): string | void => {
    switch (cmd.kind) {
      case "search": return setView({ ...view, q: cmd.query.trim() });
      case "sort": return setView({ ...view, sort: { field: cmd.field!, dir: cmd.dir } });
      case "filter": return void setTimeout(() => setFiltering(true));
      case "help": return void setTimeout(() => setHelp(true));
      case "run": {
        const arg = cmd.arg.trim();
        if (cmd.name === "paid" || cmd.name === "unpaid") {
          const paying = cmd.name === "paid";
          const ids = visible.filter((r) => !!r.paidAt !== paying).map((r) => r.id);
          if (!ids.length) return paying ? "Nothing unpaid in this view." : "Nothing paid in this view.";
          const t = sovranoTotals(visible.filter((r) => ids.includes(r.id)), projects, now);
          const what = paying ? `${fmtHours(t.unpaidMinutes)} · ${fmtUSD(t.unpaidCents)}` : fmtHours(t.minutes);
          const ok = window.confirm(`Mark ${ids.length} ${ids.length === 1 ? "session" : "sessions"} (${what}) ${paying ? "paid" : "unpaid"}?`);
          if (ok) void setPaid(ids, paying);
          return;
        }
        if (cmd.name === "rate") {
          const p = targetProject();
          if (!p) return "Filter to one project (:f), or put the cursor on one of its sessions.";
          const cents = parseRate(arg);
          if (cents === undefined) return "A rate is dollars an hour - like 24 or 24.50.";
          void setRate(p.id, cents);
          return setToast({ message: cents == null ? `${p.name} has no rate now` : `${p.name}: ${fmtUSD(cents)}/h` });
        }
        if (cmd.name === "project") {
          const m = /^(.*?)(?:\s+\$?(\d+(?:\.\d{1,2})?))?$/.exec(arg);
          const name = m?.[1]?.trim() ?? "";
          if (!name) return "Name it - :project Acme, or :project Acme 30";
          const cents = m?.[2] ? parseRate(m[2]) ?? null : null;
          void createSovranoProject(name, cents).then((res) => {
            if (!res.ok) return setToast({ message: res.error });
            setProjects((ps) => [...ps, res.project].sort((a, b) => a.name.localeCompare(b.name)));
            setToast({ message: `Added ${res.project.name}` });
          });
          return;
        }
        if (cmd.name === "export") return exportView(arg.toLowerCase());
        if (cmd.name === "log") return void window.dispatchEvent(new Event(OPEN_SOVRANO_LOG_EVENT));
        if (cmd.name === "full" || cmd.name === "fit") return setView({ ...view, layout: view.layout === cmd.name ? "fit" : cmd.name });
        if (cmd.name === "clear") return setView({ q: "", sort: null, filters: {}, hideClosed: false, layout: view.layout });
      }
    }
  };

  const rowKey = (row: SovranoRow, e: KeyboardEvent): boolean => {
    if (e.key !== "p") return false;
    void setPaid([row.id], !row.paidAt);
    return true;
  };

  const toggleSort = (field: string) => {
    const s = view.sort;
    const next = s?.field !== field ? { field, dir: "asc" as const } : s.dir === "asc" ? { field, dir: "desc" as const } : null;
    setView({ ...view, sort: next });
  };

  const filterProject = (id: string) => {
    const on = view.filters.project?.length === 1 && view.filters.project[0] === id;
    setView({ ...view, filters: { ...view.filters, project: on ? [] : [id] } });
  };

  /* ── Table ──────────────────────────────────────────────────────────── */

  const columns: Column<SovranoRow>[] = [
    {
      key: "date", label: "Date", width: 124, fixed: true, kind: "text",
      editable: () => false,
      text: (r) => fmtDate(r.startedAt),
      render: (r, h) => (
        <span className="font-num text-n-600" title={`${fmtDayDate(r.startedAt)}, ${fmtHM(r.startedAt)}–${fmtHM(r.endedAt)}`}>
          {h(fmtDate(r.startedAt))} <span className="text-n-400">{fmtHM(r.startedAt)}</span>
        </span>
      ),
    },
    {
      key: "name", label: "Name", width: 260, kind: "text",
      text: (r) => r.name,
      render: (r, h) => <span className="font-medium text-n-800">{h(r.name)}</span>,
    },
    {
      key: "project", label: "Project", width: 150, kind: "select",
      text: (r) => r.projectId,
      options: () => projects.map((p) => ({ value: p.id, label: p.name })),
      render: (r, h) => <span className="text-n-700">{h(projectName(r.projectId))}</span>,
    },
    {
      key: "platform", label: "Platform", width: 112, fixed: true, kind: "select",
      text: (r) => r.platform,
      options: () => PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] })),
      render: (r, h) => <span className="text-n-600">{h(isPlatform(r.platform) ? PLATFORM_SHORT[r.platform] : r.platform)}</span>,
    },
    {
      key: "time", label: "Time", width: 84, fixed: true, kind: "text",
      text: (r) => String(r.minutes),
      render: (r, h) => (
        <span className="font-num text-n-800" title={r.minutes < r.rawMinutes ? `Trimmed from ${fmtDuration(r.rawMinutes)}` : undefined}>
          {h(fmtDuration(r.minutes))}
        </span>
      ),
    },
    {
      key: "value", label: "Value", width: 96, fixed: true, kind: "text",
      editable: () => false,
      text: (r) => texts(r).value,
      render: (r, h) => {
        const v = texts(r).value;
        return v ? <span className="font-num text-n-800">{h(v)}</span> : <span className="text-n-300" title="This project has no rate yet - :rate">no rate</span>;
      },
    },
    {
      key: "paid", label: "Paid", width: 96, fixed: true, kind: "select",
      text: (r) => (r.paidAt ? "paid" : "unpaid"),
      options: () => [{ value: "unpaid", label: "Unpaid" }, { value: "paid", label: "Paid" }],
      render: (r) =>
        r.paidAt ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ok-ink" title={`Paid ${fmtDayDate(r.paidAt)}`}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M1.5 5.2 4 7.5 8.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {fmtDate(r.paidAt)}
          </span>
        ) : (
          <span className="text-[12px] font-medium text-warn-ink">Unpaid</span>
        ),
    },
  ];

  const empty = (
    <div className="px-6 py-14 text-center">
      {rows.length ? (
        <p className="text-[13px] text-n-500">Nothing matches. <Kbd>:</Kbd> <span className="font-num">clear</span> resets the view.</p>
      ) : (
        <>
          <p className="font-display text-[18px] font-semibold text-n-800">No work logged yet</p>
          <p className="mt-1.5 text-[13px] text-n-500">
            Press <Kbd>{SOVRANO_KEY}</Kbd> to start - anywhere in Livio or Studio - and again to log it.
          </p>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-sov-600">Work</p>
          <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">Sovrano</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden items-center gap-3 text-[11.5px] text-n-400 sm:flex">
            <span className="flex items-center gap-1.5"><Kbd>:</Kbd> commands</span>
            <span className="flex items-center gap-1.5"><Kbd>?</Kbd> keys</span>
          </p>
          <button type="button" onClick={() => { const e = exportView("pdf"); if (e) setToast({ message: e }); }} className={headerBtn}>PDF</button>
          <button type="button" onClick={() => { const e = exportView("json"); if (e) setToast({ message: e }); }} className={headerBtn}>JSON</button>
        </div>
      </div>

      <Stats totals={totals} />

      <Projects
        totals={totals}
        projects={projects}
        selected={view.filters.project?.length === 1 ? view.filters.project[0] : null}
        onSelect={filterProject}
        onRate={setRate}
        onRename={async (id, name) => {
          const res = await renameSovranoProject(id, name);
          if (!res.ok) return setToast({ message: res.error });
          setProjects((ps) => ps.map((p) => (p.id === id ? res.project : p)));
        }}
        onDelete={async (id) => {
          const res = await deleteSovranoProject(id);
          if (!res.ok) return setToast({ message: res.error });
          setProjects((ps) => ps.filter((p) => p.id !== id));
        }}
      />

      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Eyebrow className="mr-1">Sessions <span className="font-num text-n-400">{rows.length}</span></Eyebrow>
          {view.q && <Chip onClear={() => setView({ ...view, q: "" })}>Search <b className="font-num">{view.q}</b></Chip>}
          {Object.entries(view.filters).map(([k, values]) =>
            values.length ? (
              <Chip key={k} onClear={() => setView({ ...view, filters: { ...view.filters, [k]: [] } })}>
                {k === "project" ? "Project" : k === "platform" ? "Platform" : "Paid"}{" "}
                <b>{values.map((v) => (k === "project" ? projectName(v) : k === "platform" ? (isPlatform(v) ? PLATFORM_LABEL[v] : v) : v === "paid" ? "Paid" : "Unpaid")).join(", ")}</b>
              </Chip>
            ) : null,
          )}
          {view.sort && (
            <Chip onClear={() => setView({ ...view, sort: null })}>
              Sorted by <b>{FIELDS.find((f) => f.key === view.sort!.field)?.label ?? view.sort.field} {view.sort.dir === "asc" ? "↑" : "↓"}</b>
            </Chip>
          )}
          {filtered && (
            <span className="ml-1 font-num text-[11.5px] text-n-400">
              {visible.length} shown · {fmtHours(viewTotals.minutes)}
              {viewTotals.unpaidMinutes > 0 && <> · {fmtUSD(viewTotals.unpaidCents)} owed</>}
            </span>
          )}
        </div>

        <DataTable
          rows={visible}
          columns={columns}
          rowId={(r) => r.id}
          onCommit={commit}
          onDelete={remove}
          onSort={toggleSort}
          sort={view.sort}
          dim={(r) => !!r.paidAt}
          highlight={(text, column) => highlightRanges(text, column, query)}
          keysActive={!modal}
          empty={empty}
          layout={view.layout === "full" ? "full" : "fit"}
          onRowKey={rowKey}
          onCursor={(r) => { cursorRow.current = r; }}
        />
      </section>

      {command !== null && (
        <CommandBar initial={command} commands={COMMANDS} fields={FIELDS} onRun={run} onPreview={setPreviewQ} onClose={() => setCommand(null)} />
      )}
      {help && <HelpSheet sections={HELP} onClose={() => setHelp(false)} />}
      {filtering && (
        <FilterMenu
          groups={[
            { key: "project", label: "Project", options: projects.map((p) => ({ value: p.id, label: p.name, count: rows.filter((r) => r.projectId === p.id).length })) },
            { key: "platform", label: "Platform", options: PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p], count: rows.filter((r) => r.platform === p).length })) },
            {
              key: "paid", label: "Paid", options: [
                { value: "unpaid", label: "Unpaid", count: rows.filter((r) => !r.paidAt).length },
                { value: "paid", label: "Paid", count: rows.filter((r) => r.paidAt).length },
              ],
            },
          ]}
          filters={view.filters}
          hideClosed={false}
          onChange={(filters) => setView({ ...view, filters })}
          onClose={() => setFiltering(false)}
        />
      )}
      {toast && <UndoToast message={toast.message} onUndo={toast.undo} onDone={() => setToast(null)} />}
    </div>
  );
}

const headerBtn =
  "h-8 rounded-md border border-n-200 bg-n-0 px-2.5 text-[12px] font-semibold text-n-600 transition-colors duration-[120ms] hover:border-sov-200 hover:text-sov-700";

/** The headline: what's owed first - it's the number that matters on payday. */
function Stats({ totals: t }: { totals: ReturnType<typeof sovranoTotals> }) {
  const cell = "min-w-0 px-5 py-3.5";
  const big = "mt-1 font-num text-[22px] font-semibold leading-7 text-n-900";
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 divide-n-100 rounded-lg border border-n-100 bg-n-0 sm:grid-cols-5 sm:divide-x">
        <div className={clsx(cell, "col-span-2 sm:col-span-1")}>
          <Eyebrow>Owed</Eyebrow>
          <p className={clsx(big, "text-sov-600")}>{fmtUSD(t.unpaidCents)}</p>
          <p className="text-[11.5px] text-n-400"><span className="font-num">{fmtHours(t.unpaidMinutes)}</span> unpaid</p>
        </div>
        <div className={cell}>
          <Eyebrow>This week</Eyebrow>
          <p className={big}>{fmtHours(t.weekMinutes)}</p>
        </div>
        <div className={cell}>
          <Eyebrow>This month</Eyebrow>
          <p className={big}>{fmtHours(t.monthMinutes)}</p>
        </div>
        <div className={cell}>
          <Eyebrow>All time</Eyebrow>
          <p className={big}>{fmtHours(t.minutes)}</p>
          <p className="truncate text-[11.5px] text-n-400">
            {PLATFORMS.filter((p) => t.perPlatform[p] > 0).map((p) => `${PLATFORM_SHORT[p]} ${fmtHours(t.perPlatform[p])}`).join(" · ") || "-"}
          </p>
        </div>
        <div className={cell}>
          <Eyebrow>Paid to date</Eyebrow>
          <p className={big}>{fmtUSD(t.paidCents)}</p>
        </div>
      </div>
      {t.unratedMinutes > 0 && (
        <p className="text-[12px] text-warn-ink">
          <span className="font-num font-semibold">{fmtHours(t.unratedMinutes)}</span> unpaid on projects with no rate isn't in the owed total - give them one below.
        </p>
      )}
    </div>
  );
}

/** Each project: its rate (click to set), what's owed and paid. Click a name to see only its sessions. */
function Projects({
  totals, projects, selected, onSelect, onRate, onRename, onDelete,
}: {
  totals: ReturnType<typeof sovranoTotals>;
  projects: SovranoProjectRow[];
  selected: string | null;
  onSelect: (id: string) => void;
  onRate: (id: string, cents: number | null) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!projects.length) {
    return (
      <p className="rounded-lg border border-dashed border-n-200 px-5 py-4 text-[13px] text-n-500">
        No projects yet. Make one as you log your first session, or <Kbd>:</Kbd> <span className="font-num text-n-700">project Name 24</span>.
      </p>
    );
  }
  const head = "px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-400";
  return (
    <section>
      <Eyebrow className="mb-2">Projects</Eyebrow>
      <div className="overflow-x-auto rounded-lg border border-n-100 bg-n-0">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead className="border-b border-n-100">
            <tr>
              <th className={head}>Project</th>
              <th className={clsx(head, "w-[110px]")}>Rate</th>
              <th className={clsx(head, "w-[96px] text-right")}>Unpaid</th>
              <th className={clsx(head, "w-[110px] text-right")}>Owed</th>
              <th className={clsx(head, "w-[110px] text-right")}>Paid</th>
              <th className={clsx(head, "w-[96px] text-right")}>Last</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-n-100">
            {totals.projects.map((p) => (
              <tr key={p.id} className={clsx("transition-colors", selected === p.id ? "bg-sov-50" : "hover:bg-n-25")}>
                <td className="px-3 py-1.5">
                  <ProjectName name={p.name} active={selected === p.id} onSelect={() => onSelect(p.id)} onRename={(n) => onRename(p.id, n)} />
                </td>
                <td className="px-3 py-1.5">
                  <RateCell cents={p.rateCents} onSave={(c) => onRate(p.id, c)} />
                </td>
                <td className="px-3 py-1.5 text-right font-num text-n-700">{p.unpaidMinutes ? fmtHours(p.unpaidMinutes) : <span className="text-n-300">-</span>}</td>
                <td className="px-3 py-1.5 text-right font-num font-semibold text-n-900">
                  {p.unpaidCents == null ? <span className="font-normal text-warn-ink" title="Set a rate to see what this is worth">no rate</span> : p.unpaidMinutes ? fmtUSD(p.unpaidCents) : <span className="font-normal text-n-300">-</span>}
                </td>
                <td className="px-3 py-1.5 text-right font-num text-n-600">{p.paidCents ? fmtUSD(p.paidCents) : <span className="text-n-300">-</span>}</td>
                <td className="px-3 py-1.5 text-right font-num text-n-500">{p.lastWorked ? fmtDate(p.lastWorked) : <span className="text-n-300">-</span>}</td>
                <td className="px-1 py-1.5 text-right">
                  {p.sessions === 0 && (
                    <button type="button" onClick={() => onDelete(p.id)} aria-label={`Delete ${p.name}`} title="Delete - it has no sessions" className="flex h-6 w-6 items-center justify-center rounded-full text-n-300 transition-colors hover:bg-danger-soft hover:text-danger">
                      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Click to filter by it; double-click to rename. */
function ProjectName({ name, active, onSelect, onRename }: { name: string; active: boolean; onSelect: () => void; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);
  if (editing) {
    const done = (keep: boolean) => {
      setEditing(false);
      if (keep && text.trim() && text.trim() !== name) onRename(text.trim());
      else setText(name);
    };
    return (
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => done(true)}
        onKeyDown={(e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); }}
        {...NO_AUTOFILL}
        className="h-7 w-full rounded-sm border border-sov-400 bg-n-0 px-1.5 text-[13px] font-medium text-n-800 outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={() => { setText(name); setEditing(true); }}
      title={active ? "Showing only this project - click to show all. Double-click to rename." : "Show only this project's sessions. Double-click to rename."}
      className={clsx("h-7 max-w-full truncate text-left font-medium", active ? "text-sov-700" : "text-n-800 hover:text-sov-700")}
    >
      {name}
    </button>
  );
}

/** "$24.00/h" - click it and type a new one; empty clears it. */
function RateCell({ cents, onSave }: { cents: number | null; onSave: (cents: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  if (editing) {
    const done = (keep: boolean) => {
      if (!keep) return setEditing(false);
      const next = parseRate(text);
      if (next === undefined) return setBad(true);
      setEditing(false);
      if (next !== cents) onSave(next);
    };
    return (
      <span className="flex items-center gap-1">
        <span className="text-n-400">$</span>
        <input
          autoFocus
          value={text}
          onChange={(e) => { setText(e.target.value); setBad(false); }}
          onBlur={() => done(true)}
          onKeyDown={(e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); }}
          placeholder="24.50"
          inputMode="decimal"
          aria-label="Hourly rate in USD"
          {...NO_AUTOFILL}
          className={clsx("font-num h-7 w-16 rounded-sm border bg-n-0 px-1.5 text-[13px] text-n-800 outline-none", bad ? "border-danger" : "border-sov-400")}
        />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => { setText(cents == null ? "" : (cents / 100).toFixed(2)); setEditing(true); }}
      title="Hourly rate in USD - click to change"
      className={clsx("font-num h-7 rounded-sm px-1 -mx-1 text-left transition-colors hover:bg-n-50", cents == null ? "text-warn-ink" : "text-n-700")}
    >
      {cents == null ? "Set rate" : `${fmtUSD(cents)}/h`}
    </button>
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

