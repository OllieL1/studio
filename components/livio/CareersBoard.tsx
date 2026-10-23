"use client";

import type { Route } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createCareer, deleteCareer, listCareers, restoreCareer, updateCareer,
  type CareerPatch, type CareerRow,
} from "@/app/careerActions";
import {
  CAREER_TYPES, isClosed, isStale, linkLabel, normaliseLink, parseContact, quietDays, STALE_DAYS, STATUS_LABEL,
  STATUSES, statusesFor, statusForType, TYPE_LABEL, type CareerStatus, type CareerType,
} from "@/lib/careers";
import { fmtDate, fmtDayDate, urgencyOf } from "@/lib/dates";
import { isTypingTarget } from "@/lib/livio/keys";
import {
  highlightRanges, parseQuery, rowMatches, sortRows, viewFromParams, viewToSearch,
  type Field, type PageCommand, type ParsedCommand, type View,
} from "@/lib/livio/table";
import { clsx } from "@/lib/clsx";
import { Eyebrow, Pill } from "../ui";
import { MarkdownField } from "../MarkdownField";
import { CommandBar } from "./CommandBar";
import { DataTable, type CellValue, type Column } from "./DataTable";
import { Drawer } from "./Drawer";
import { FilterMenu } from "./FilterMenu";
import { HelpSheet, type HelpSection } from "./HelpSheet";
import { Kbd } from "./Kbd";
import { UndoToast } from "./UndoToast";

const FIELDS: Field[] = [
  { key: "company", label: "Company" },
  { key: "role", label: "Role", aliases: ["position", "title"] },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "sent", label: "Sent", aliases: ["date", "date sent"] },
  { key: "deadline", label: "Deadline", aliases: ["due"] },
  { key: "contact", label: "Contact", aliases: ["email", "person"] },
  { key: "link", label: "Link", aliases: ["url"] },
  { key: "notes", label: "Notes" },
];

const COMMANDS: PageCommand[] = [
  { name: "cold email", hint: "New cold email", arg: "company" },
  { name: "application", hint: "New application", arg: "company" },
  { name: "closed", hint: "Show or hide offered and rejected" },
  { name: "clear", hint: "Clear search, filters and sort" },
];

const FILTER_KEYS = ["type", "status"];

const HELP: HelpSection[] = [
  {
    title: "Moving",
    rows: [
      [["↑", "↓", "←", "→"], "Move the cursor"],
      [["h", "j", "k", "l"], "…or vim keys"],
      [["tab"], "Next cell"],
      [["g", "G"], "First / last row"],
      [["esc"], "Drop the cursor"],
    ],
  },
  {
    title: "Rows",
    rows: [
      [["↵"], "Edit the cell"],
      [["space"], "Open the row: notes and details"],
      [["⌘", "↵"], "Follow the link"],
      [["⌫"], "Delete (undo with u)"],
    ],
  },
  {
    title: "Commands",
    rows: [
      [[":"], "Command bar"],
      [["/"], "Search"],
      [["?"], "This sheet"],
      [[":cold email"], "New cold email"],
      [[":application"], "New application"],
    ],
  },
  {
    title: "Viewing",
    rows: [
      [[":s goo status:wait"], "Search, narrowed by field"],
      [[":f"], "Filter by type and status"],
      [[":^ deadline"], "Sort ascending"],
      [[":!^ sent"], "Sort descending"],
      [[":closed"], "Hide offered and rejected"],
      [[":clear"], "Reset the view"],
    ],
  },
  {
    title: "Editing",
    rows: [
      [["↵"], "Save"],
      [["tab"], "Save and move right"],
      [["esc"], "Cancel"],
      [["fri", "3 oct"], "Dates in words"],
    ],
  },
];

const STATUS_TONE: Record<CareerStatus, "neutral" | "ok" | "warn" | "danger" | "info" | "rust"> = {
  TODO: "neutral",
  EMAIL_SENT: "info",
  APPLIED: "info",
  BACK_AND_FORTH: "rust",
  WAITING: "neutral",
  INTERVIEW: "rust",
  OFFERED: "ok",
  REJECTED: "danger",
};

const contactText = (r: CareerRow) => [r.contactName, r.contactEmail].filter(Boolean).join(" ");

function searchTexts(r: CareerRow): Record<string, string> {
  return {
    company: r.company,
    role: r.role ?? "",
    type: TYPE_LABEL[r.type],
    status: STATUS_LABEL[r.status],
    sent: r.sentAt ? fmtDate(r.sentAt) : "",
    deadline: r.deadline ? fmtDate(r.deadline) : "",
    contact: contactText(r),
    link: r.link ?? "",
    notes: r.notesMd ?? "",
  };
}

function sortValue(r: CareerRow, field: string): string | number | null {
  switch (field) {
    case "status": return STATUSES.indexOf(r.status);
    case "sent": return r.sentAt?.getTime() ?? null;
    case "deadline": return r.deadline?.getTime() ?? null;
    case "type": return TYPE_LABEL[r.type];
    default: return searchTexts(r)[field] || null;
  }
}

/** The local half of an edit, so the cell changes the moment Enter is pressed. */
function applyLocally(r: CareerRow, patch: CareerPatch): CareerRow {
  const next = { ...r };
  if (patch.company !== undefined) next.company = patch.company.trim();
  if (patch.role !== undefined) next.role = patch.role.trim() || null;
  if (patch.contact !== undefined) Object.assign(next, parseContact(patch.contact));
  if (patch.link !== undefined) next.link = normaliseLink(patch.link);
  if (patch.sentAt !== undefined) next.sentAt = patch.sentAt;
  if (patch.deadline !== undefined) next.deadline = patch.deadline;
  if (patch.type !== undefined) {
    next.type = patch.type as CareerType;
    next.status = statusForType(next.status, next.type);
  }
  if (patch.status !== undefined) next.status = patch.status as CareerStatus;
  return next;
}

export function CareersBoard({ initial }: { initial: CareerRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [rows, setRows] = useState(initial);
  const [now] = useState(() => new Date());

  const view = useMemo(() => viewFromParams(Object.fromEntries(params), FILTER_KEYS), [params]);
  const [previewQ, setPreviewQ] = useState<string | null>(null);
  const q = previewQ ?? view.q;
  const query = useMemo(() => parseQuery(q, FIELDS), [q]);

  const [command, setCommand] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ row: CareerRow } | null>(null);
  const [focus, setFocus] = useState<{ id: string; column?: string; edit?: boolean; nonce: number } | null>(null);
  // A row just made stays in sight whatever the view hides, until the view changes.
  const [fresh, setFresh] = useState<string | null>(null);

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
      if (view.hideClosed && isClosed(r.status)) return false;
      for (const [key, values] of Object.entries(view.filters)) {
        if (values.length && !values.includes(key === "type" ? r.type : r.status)) return false;
      }
      return rowMatches(searchTexts(r), query);
    });
    return sortRows(kept, view.sort, sortValue, (r) => isClosed(r.status) && r.id !== fresh);
  }, [rows, view, query, fresh]);

  const stale = useMemo(() => rows.filter((r) => isStale(r, now)), [rows, now]);
  const modal = command !== null || help || filtering || openId !== null;

  // `:` for commands, `/` to search, `?` for help - when nothing else has the keys.
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

  const replaceRow = (row: CareerRow) => setRows((rs) => rs.map((r) => (r.id === row.id ? row : r)));

  const save = async (row: CareerRow, patch: CareerPatch) => {
    setRows((rs) => rs.map((r) => (r.id === row.id ? applyLocally(r, patch) : r)));
    try {
      replaceRow(await updateCareer(row.id, patch));
    } catch {
      // Put the truth back rather than leave an edit that didn't save.
      setRows(await listCareers());
    }
  };

  const commit = (row: CareerRow, column: string, value: CellValue) => {
    const text = typeof value === "string" ? value : "";
    const patch: CareerPatch =
      column === "sent" ? { sentAt: value instanceof Date ? value : null }
      : column === "deadline" ? { deadline: value instanceof Date ? value : null }
      : { [column]: text };
    void save(row, patch);
  };

  const create = async (type: CareerType, company: string) => {
    const row = await createCareer(type, company);
    setRows((rs) => [row, ...rs]);
    setFresh(row.id);
    setFocus({ id: row.id, column: company ? "role" : "company", edit: true, nonce: Date.now() });
  };

  const remove = (row: CareerRow) => {
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    setOpenId(null);
    setToast({ row });
    void deleteCareer(row.id);
  };

  const undo = useCallback(async () => {
    if (!toast) return;
    const { row } = toast;
    setToast(null);
    const back = await restoreCareer(row);
    setRows((rs) => [back, ...rs.filter((r) => r.id !== back.id)]);
    setFocus({ id: back.id, nonce: Date.now() });
  }, [toast]);

  const run = (cmd: ParsedCommand): string | void => {
    switch (cmd.kind) {
      case "search": return setView({ ...view, q: cmd.query.trim() });
      case "sort": return setView({ ...view, sort: { field: cmd.field!, dir: cmd.dir } });
      case "filter": return void setTimeout(() => setFiltering(true));
      case "help": return void setTimeout(() => setHelp(true));
      case "run":
        if (cmd.name === "cold email") return void create("COLD_EMAIL", cmd.arg);
        if (cmd.name === "application") return void create("APPLICATION", cmd.arg);
        if (cmd.name === "closed") return setView({ ...view, hideClosed: !view.hideClosed });
        if (cmd.name === "clear") return setView({ q: "", sort: null, filters: {}, hideClosed: false });
    }
  };

  const toggleSort = (field: string) => {
    const s = view.sort;
    const next = s?.field !== field ? { field, dir: "asc" as const } : s.dir === "asc" ? { field, dir: "desc" as const } : null;
    setView({ ...view, sort: next });
  };

  const columns: Column<CareerRow>[] = [
    {
      key: "company", label: "Company", width: 168, kind: "text",
      text: (r) => r.company,
      render: (r, hl) => r.company
        ? <span className="font-medium text-n-800">{hl(r.company)}</span>
        : <span className="text-n-300">Company</span>,
    },
    {
      key: "role", label: "Role", width: 184, kind: "text",
      text: (r) => r.role ?? "",
      render: (r, hl) => <span className="text-n-600">{r.role ? hl(r.role) : ""}</span>,
    },
    {
      key: "type", label: "Type", width: 112, kind: "select",
      text: (r) => TYPE_LABEL[r.type],
      options: () => CAREER_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] })),
      render: (r, hl) => <span className="text-n-600">{hl(TYPE_LABEL[r.type])}</span>,
    },
    {
      key: "status", label: "Status", width: 176, kind: "select",
      text: (r) => STATUS_LABEL[r.status],
      options: (r) => statusesFor(r.type).map((s) => ({ value: s, label: STATUS_LABEL[s] })),
      render: (r, hl) => {
        const days = isStale(r, now) ? quietDays(r, now) : null;
        return (
          <span className="flex items-center gap-1.5">
            <Pill tone={STATUS_TONE[r.status]}>{hl(STATUS_LABEL[r.status])}</Pill>
            {days !== null && (
              <span
                title={`No reply for ${days} days - time to chase`}
                className="flex items-center gap-1 font-num text-[11px] font-semibold text-warn"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warn" />
                {days}d
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "sent", label: "Sent", width: 84, kind: "date", direction: "past",
      text: (r) => (r.sentAt ? fmtDate(r.sentAt) : ""),
      render: (r, hl) => r.sentAt
        ? <span className="font-num text-n-600" title={fmtDayDate(r.sentAt)}>{hl(fmtDate(r.sentAt))}</span>
        : <span className="text-n-300">-</span>,
    },
    {
      key: "deadline", label: "Deadline", width: 96, kind: "date", direction: "future",
      editable: (r) => r.type === "APPLICATION",
      text: (r) => (r.deadline ? fmtDate(r.deadline) : ""),
      render: (r, hl) => {
        if (r.type !== "APPLICATION") return null;
        if (!r.deadline) return <span className="text-n-300">-</span>;
        const u = urgencyOf(r.deadline, isClosed(r.status) || r.status !== "TODO");
        return (
          <span
            title={fmtDayDate(r.deadline)}
            className={clsx("font-num", u === "overdue" ? "font-semibold text-danger" : u === "soon" ? "font-semibold text-warn" : "text-n-600")}
          >
            {hl(fmtDate(r.deadline))}
          </span>
        );
      },
    },
    {
      key: "contact", label: "Contact", width: 160, kind: "text",
      text: contactText,
      render: (r, hl) => {
        if (!r.contactName && !r.contactEmail) return null;
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-n-700" title={r.contactEmail ?? undefined}>{hl(r.contactName ?? r.contactEmail ?? "")}</span>
            {r.contactEmail && r.contactName && (
              <a
                href={`mailto:${r.contactEmail}`}
                title={r.contactEmail}
                aria-label={`Email ${r.contactName}`}
                className="shrink-0 text-n-400 transition-colors hover:text-rust-600"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="1.8" y="3.3" width="12.4" height="9.4" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M2.5 4.5 8 8.6l5.5-4.1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </a>
            )}
          </span>
        );
      },
    },
    {
      key: "link", label: "Link", width: 140, kind: "link",
      text: (r) => r.link ?? "",
      href: (r) => r.link,
      render: (r, hl) => r.link
        ? (
          <a href={r.link} target="_blank" rel="noreferrer" title={r.link} className="text-rust-600 underline-offset-2 hover:underline">
            {hl(linkLabel(r.link))}
          </a>
        )
        : null,
    },
  ];

  const open = rows.find((r) => r.id === openId) ?? null;
  const viewing = view.q || view.sort || Object.values(view.filters).some((v) => v.length) || view.hideClosed;
  const inPlay = rows.filter((r) => !isClosed(r.status) && r.status !== "TODO").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Job hunt</Eyebrow>
          <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">Careers</h1>
          <p className="mt-1 text-[13px] text-n-500">
            {rows.length ? (
              <>
                <span className="font-num">{rows.length}</span> {rows.length === 1 ? "entry" : "entries"}
                {" · "}<span className="font-num">{inPlay}</span> in play
                {stale.length > 0 && <> · <span className="font-num font-semibold text-warn">{stale.length}</span> to chase</>}
              </>
            ) : "Cold emails and applications, all in one place."}
          </p>
        </div>
        <p className="flex items-center gap-3 text-[11.5px] text-n-400">
          <span className="flex items-center gap-1.5"><Kbd>:</Kbd> commands</span>
          <span className="flex items-center gap-1.5"><Kbd>?</Kbd> keys</span>
        </p>
      </div>

      {stale.length > 0 && (
        <div className="animate-fade-in flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-warn-soft px-3.5 py-2.5 text-[12.5px] text-warn-ink">
          <span className="font-medium">Quiet for {STALE_DAYS}+ days:</span>
          {stale.map((r, i) => (
            <span key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setFresh(r.id);
                  setFocus({ id: r.id, column: "status", nonce: Date.now() });
                }}
                className="font-semibold underline-offset-2 hover:underline"
              >
                {r.company || "Untitled"}
              </button>
              <span className="font-num opacity-70"> {quietDays(r, now)}d</span>
              {i < stale.length - 1 && ","}
            </span>
          ))}
        </div>
      )}

      {viewing && (
        <div className="flex flex-wrap items-center gap-1.5">
          {view.q && <Chip onClear={() => setView({ ...view, q: "" })}>Search <b className="font-num">{view.q}</b></Chip>}
          {Object.entries(view.filters).map(([k, values]) =>
            values.length ? (
              <Chip key={k} onClear={() => setView({ ...view, filters: { ...view.filters, [k]: [] } })}>
                {k === "type" ? "Type" : "Status"}{" "}
                <b>{values.map((v) => (k === "type" ? TYPE_LABEL[v as CareerType] : STATUS_LABEL[v as CareerStatus]) ?? v).join(", ")}</b>
              </Chip>
            ) : null,
          )}
          {view.sort && (
            <Chip onClear={() => setView({ ...view, sort: null })}>
              Sorted by <b>{FIELDS.find((f) => f.key === view.sort!.field)?.label ?? view.sort.field} {view.sort.dir === "asc" ? "↑" : "↓"}</b>
            </Chip>
          )}
          {view.hideClosed && <Chip onClear={() => setView({ ...view, hideClosed: false })}>Hiding <b>offered and rejected</b></Chip>}
          <span className="ml-1 font-num text-[11.5px] text-n-400">{visible.length} shown</span>
        </div>
      )}

      <DataTable
        rows={visible}
        columns={columns}
        rowId={(r) => r.id}
        onCommit={commit}
        onOpen={(r) => setOpenId(r.id)}
        onDelete={remove}
        onSort={toggleSort}
        sort={view.sort}
        dim={(r) => isClosed(r.status)}
        highlight={(text, column) => highlightRanges(text, column, query)}
        keysActive={!modal}
        focus={focus}
        empty={
          <div className="px-6 py-14 text-center">
            {rows.length ? (
              <p className="text-[13px] text-n-500">Nothing matches. <Kbd>:</Kbd> <span className="font-num">clear</span> resets the view.</p>
            ) : (
              <>
                <p className="font-display text-[18px] font-semibold text-n-800">Nothing sent yet</p>
                <p className="mt-1.5 text-[13px] text-n-500">
                  Press <Kbd>:</Kbd> and type <span className="font-num text-n-700">cold email</span> or{" "}
                  <span className="font-num text-n-700">application</span>.
                </p>
              </>
            )}
          </div>
        }
      />

      {command !== null && (
        <CommandBar
          initial={command}
          commands={COMMANDS}
          fields={FIELDS}
          onRun={run}
          onPreview={setPreviewQ}
          onClose={() => setCommand(null)}
        />
      )}
      {help && <HelpSheet sections={HELP} onClose={() => setHelp(false)} />}
      {filtering && (
        <FilterMenu
          groups={[
            {
              key: "type", label: "Type",
              options: CAREER_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t], count: rows.filter((r) => r.type === t).length })),
            },
            {
              key: "status", label: "Status",
              options: STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], count: rows.filter((r) => r.status === s).length })),
            },
          ]}
          filters={view.filters}
          hideClosed={view.hideClosed}
          closedLabel="Hide offered and rejected"
          onChange={(filters, hideClosed) => setView({ ...view, filters, hideClosed })}
          onClose={() => setFiltering(false)}
        />
      )}
      {open && <EntryPanel row={open} onSave={(patch) => save(open, patch)} onDelete={() => remove(open)} onClose={() => setOpenId(null)} />}
      {toast && (
        <UndoToast
          message={`Deleted ${toast.row.company || "entry"}`}
          onUndo={undo}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-n-200 bg-n-0 py-0.5 pl-2.5 pr-1 text-[12px] text-n-600 [&_b]:font-semibold [&_b]:text-n-800">
      {children}
      <button
        type="button"
        onClick={onClear}
        aria-label="Remove"
        className="flex h-4 w-4 items-center justify-center rounded-full text-n-400 transition-colors hover:bg-n-100 hover:text-n-700"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
          <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}

/** One entry in full: the details at a glance, and the notes to write in. */
function EntryPanel({ row, onSave, onDelete, onClose }: {
  row: CareerRow;
  onSave: (patch: CareerPatch) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const days = quietDays(row);
  return (
    <Drawer label={row.company || "Entry"} onClose={onClose}>
      <div className="border-b border-n-100 px-6 pb-5 pt-6">
        <Eyebrow>{TYPE_LABEL[row.type]}</Eyebrow>
        <h2 className="font-display mt-1 text-[26px] leading-8 font-semibold tracking-tight text-n-900">{row.company || "Untitled"}</h2>
        {row.role && <p className="mt-0.5 text-[14px] text-n-600">{row.role}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Pill>
          {days !== null && (
            <span className={clsx("text-[12px]", days >= STALE_DAYS ? "font-semibold text-warn" : "text-n-500")}>
              {days === 0 ? "Sent today" : `${days} ${days === 1 ? "day" : "days"} without a reply`}
            </span>
          )}
        </div>
        <dl className="mt-5 grid grid-cols-[88px_1fr] gap-y-2 text-[13px]">
          <Detail label="Sent">{row.sentAt ? fmtDayDate(row.sentAt) : null}</Detail>
          {row.type === "APPLICATION" && <Detail label="Deadline">{row.deadline ? fmtDayDate(row.deadline) : null}</Detail>}
          <Detail label="Contact">
            {row.contactName || row.contactEmail ? (
              <>
                {row.contactName}
                {row.contactEmail && (
                  <a href={`mailto:${row.contactEmail}`} className="ml-1.5 text-rust-600 underline-offset-2 hover:underline">{row.contactEmail}</a>
                )}
              </>
            ) : null}
          </Detail>
          <Detail label="Link">
            {row.link ? <a href={row.link} target="_blank" rel="noreferrer" className="break-all text-rust-600 underline-offset-2 hover:underline">{row.link}</a> : null}
          </Detail>
        </dl>
      </div>
      <div className="flex-1 px-6 py-5">
        <Eyebrow className="mb-2">Notes</Eyebrow>
        <MarkdownField
          initial={row.notesMd ?? ""}
          save={(notesMd) => onSave({ notesMd })}
          placeholder="Who you spoke to, what they said, what to send next…"
          minHeight={220}
        />
      </div>
      <div className="flex items-center justify-between border-t border-n-100 px-6 py-3">
        <span className="text-[11.5px] text-n-400">Edit the fields in the table - <Kbd>esc</Kbd> to go back</span>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-n-500 transition-colors hover:bg-danger-soft hover:text-danger"
        >
          Delete
        </button>
      </div>
    </Drawer>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-n-400">{label}</dt>
      <dd className="min-w-0 text-n-700">{children ?? <span className="text-n-300">-</span>}</dd>
    </>
  );
}
