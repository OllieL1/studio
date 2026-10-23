"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTodo, deleteTodo, dismissInbox, enterInbox, pullInbox, restoreTodo, toggleTodo, toggleTodoCalendar,
  undismissInbox, updateInbox, updateTodo,
  type InboxPatch, type InboxRow, type TodoCourse, type TodoPatch, type TodoRow,
} from "@/app/todoActions";
import { LIVIO_BASE } from "@/lib/apps";
import { clsx } from "@/lib/clsx";
import { fmtAgo, fmtDayDate, fmtHM } from "@/lib/dates";
import { isTypingTarget, NO_AUTOFILL } from "@/lib/livio/keys";
import { highlightRanges, parseQuery, rowMatches, type Field, type PageCommand, type ParsedCommand } from "@/lib/livio/table";
import { dueLabel, dueText, groupOf, groupTodos, hasTime, parseDue, parseTodo } from "@/lib/livio/todo";
import { cssColour } from "@/lib/palette";
import { Eyebrow } from "../ui";
import { CommandBar } from "./CommandBar";
import { HelpSheet, type HelpSection } from "./HelpSheet";
import { Kbd } from "./Kbd";
import { UndoToast } from "./UndoToast";

const FIELDS: Field[] = [{ key: "title", label: "Title" }];

const COMMANDS: PageCommand[] = [
  { name: "new", hint: "Add a todo - fri 5pm, ! for priority, @course for Studio", arg: "todo" },
  { name: "sync", hint: "Pull from Notion now" },
  { name: "done", hint: "Show or hide what's finished" },
  { name: "clear", hint: "Clear the search" },
];

const HELP: HelpSection[] = [
  {
    title: "Moving",
    rows: [
      [["↑", "↓"], "Move"],
      [["j", "k"], "…or vim keys"],
      [["g", "G"], "First / last"],
      [["n"], "Write a new todo"],
      [["esc"], "Drop the cursor"],
    ],
  },
  {
    title: "A todo",
    rows: [
      [["x"], "Done / not done"],
      [["↵"], "Rename"],
      [["d"], "Due date - fri 5pm, 3 nov"],
      [["p"], "Priority"],
      [["c"], "Google Calendar on / off"],
      [["m"], "Move to a Studio course"],
      [["⌫"], "Delete (undo with u)"],
    ],
  },
  {
    title: "From Notion",
    rows: [
      [["↵"], "Enter it into your todos"],
      [["e"], "Rename first"],
      [["d", "p", "m"], "Due, priority, course"],
      [["c"], "Put it on the calendar too"],
      [["⌫"], "Dismiss (ticks Synced)"],
    ],
  },
  {
    title: "Commands",
    rows: [
      [[":"], "Command bar"],
      [["/"], "Search"],
      [[":new …"], "Add a todo"],
      [[":sync"], "Pull from Notion now"],
      [[":done"], "Show finished"],
    ],
  },
];

type Key = `inbox:${string}` | `todo:${string}`;
type Editing = { key: Key; field: "title" | "due" } | null;
type Toast = { message: string; undo?: () => void } | null;

export function TodoBoard({
  initialTodos,
  initialInbox,
  courses,
  notion,
}: {
  initialTodos: TodoRow[];
  initialInbox: InboxRow[];
  courses: TodoCourse[];
  notion: { connected: boolean; lastPulledAt: Date | null };
}) {
  const router = useRouter();
  const [todos, setTodos] = useState(initialTodos);
  const [inbox, setInbox] = useState(initialInbox);
  // A fresh render from the server (a pull, a calendar push) is the truth.
  useEffect(() => setTodos(initialTodos), [initialTodos]);
  useEffect(() => setInbox(initialInbox), [initialInbox]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [cursor, setCursor] = useState<Key | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [picking, setPicking] = useState<Key | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [q, setQ] = useState("");
  const [previewQ, setPreviewQ] = useState<string | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [pull, setPull] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const composer = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<Key, HTMLElement>());

  const query = useMemo(() => parseQuery(previewQ ?? q, FIELDS), [previewQ, q]);
  const matches = useCallback((title: string) => rowMatches({ title }, query), [query]);

  const shownInbox = inbox.filter((i) => matches(i.title));
  const { groups, done } = useMemo(() => groupTodos(todos.filter((t) => matches(t.title)), now), [todos, matches, now]);

  // Everything the cursor can land on, top to bottom.
  const order: Key[] = [
    ...shownInbox.map((i) => `inbox:${i.id}` as Key),
    ...groups.flatMap((g) => g.items.map((t) => `todo:${t.id}` as Key)),
    ...(showDone ? done.map((t) => `todo:${t.id}` as Key) : []),
  ];

  const move = (key: Key | undefined) => {
    if (!key) return;
    setCursor(key);
    rowRefs.current.get(key)?.scrollIntoView({ block: "nearest" });
  };

  const modal = command !== null || help;
  const busy = modal || editing !== null || picking !== null;

  const say = (message: string, undo?: () => void) => setToast({ message, undo });

  /* ── Todo actions ──────────────────────────────────────────────────── */

  const putTodo = (row: TodoRow) => setTodos((ts) => (ts.some((t) => t.id === row.id) ? ts.map((t) => (t.id === row.id ? row : t)) : [...ts, row]));

  const patchTodo = async (t: TodoRow, patch: TodoPatch) => {
    if (patch.courseId) setTodos((ts) => ts.filter((x) => x.id !== t.id));
    else setTodos((ts) => ts.map((x) => (x.id === t.id ? { ...x, ...patch } as TodoRow : x)));
    const res = await updateTodo(t.id, patch);
    if ("movedTo" in res) {
      say(`Moved to ${res.movedTo} in Studio`, async () => {
        setToast(null);
        const back = await updateTodo(t.id, { courseId: null });
        if ("row" in back) putTodo(back.row);
      });
    } else putTodo(res.row);
  };

  const toggle = async (t: TodoRow) => {
    setTodos((ts) => ts.map((x) => (x.id === t.id ? { ...x, doneAt: x.doneAt ? null : new Date() } : x)));
    putTodo(await toggleTodo(t.id));
  };

  const remove = async (t: TodoRow) => {
    const i = order.indexOf(`todo:${t.id}`);
    setTodos((ts) => ts.filter((x) => x.id !== t.id));
    move(order[i + 1] ?? order[i - 1]);
    const snapshot = await deleteTodo(t.id);
    if (!snapshot) return;
    say(`Deleted “${t.title}”${t.calendarEventId ? " and its calendar event" : ""}`, async () => {
      setToast(null);
      const back = await restoreTodo(snapshot);
      putTodo(back);
      move(`todo:${back.id}`);
    });
  };

  const calendar = async (t: TodoRow) => {
    if (!t.dueAt) return say("Give it a due date first - press d");
    const res = await toggleTodoCalendar(t.id);
    putTodo(res.row);
    if (res.error) say(res.error);
    else say(res.row.calendarEventId ? "On your calendar" : "Off your calendar");
  };

  /* ── Inbox actions ─────────────────────────────────────────────────── */

  const patchInbox = async (item: InboxRow, patch: InboxPatch) => {
    setInbox((xs) => xs.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
    const row = await updateInbox(item.id, patch);
    setInbox((xs) => xs.map((x) => (x.id === row.id ? row : x)));
  };

  const enter = async (item: InboxRow) => {
    const i = order.indexOf(`inbox:${item.id}`);
    setInbox((xs) => xs.filter((x) => x.id !== item.id));
    move(order[i + 1] ?? order[i - 1]);
    const res = await enterInbox(item.id);
    if ("row" in res) putTodo(res.row);
    if (res.calendarError) say(`Entered, but Google Calendar refused: ${res.calendarError}`);
    else if ("movedTo" in res) say(`Entered into ${res.movedTo} in Studio`);
  };

  const dismiss = async (item: InboxRow) => {
    const i = order.indexOf(`inbox:${item.id}`);
    setInbox((xs) => xs.filter((x) => x.id !== item.id));
    move(order[i + 1] ?? order[i - 1]);
    const gone = await dismissInbox(item.id);
    if (!gone) return;
    say(`Dismissed “${item.title}”`, async () => {
      setToast(null);
      await undismissInbox(gone);
      setInbox((xs) => [...xs, gone]);
    });
  };

  const sync = async () => {
    setPull({ busy: true, error: null });
    const res = await pullInbox(true);
    setPull({ busy: false, error: res.ok ? null : res.error });
    if (res.ok) {
      router.refresh();
      if (!res.added) say("Nothing new in Notion");
    }
  };

  /* ── Keys ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const at = cursor ? order.indexOf(cursor) : -1;
      const go = (key: Key | undefined) => {
        e.preventDefault();
        move(key);
      };
      switch (e.key) {
        case ":": e.preventDefault(); return setCommand("");
        case "/": e.preventDefault(); return setCommand(q ? `s ${q}` : "s ");
        case "?": e.preventDefault(); return setHelp(true);
        case "n": e.preventDefault(); return composer.current?.focus();
        case "ArrowDown": case "j": return go(order[Math.min(order.length - 1, at + 1)]);
        case "ArrowUp": case "k": return go(order[Math.max(0, at - 1)]);
        case "g": return go(order[0]);
        case "G": return go(order[order.length - 1]);
        case "Escape":
          if (cursor) { e.preventDefault(); setCursor(null); }
          return;
      }
      if (!cursor || at < 0) return;
      const [kind, id] = cursor.split(":") as ["inbox" | "todo", string];

      if (kind === "inbox") {
        const item = inbox.find((x) => x.id === id);
        if (!item) return;
        const act: Record<string, () => void> = {
          Enter: () => enter(item),
          e: () => setEditing({ key: cursor, field: "title" }),
          d: () => setEditing({ key: cursor, field: "due" }),
          p: () => patchInbox(item, { priority: !item.priority }),
          c: () => patchInbox(item, { toCalendar: !item.toCalendar }),
          m: () => setPicking(cursor),
          Backspace: () => dismiss(item),
          Delete: () => dismiss(item),
        };
        if (act[e.key]) { e.preventDefault(); act[e.key](); }
        return;
      }

      const t = todos.find((x) => x.id === id);
      if (!t) return;
      const act: Record<string, () => void> = {
        x: () => toggle(t),
        " ": () => toggle(t),
        Enter: () => setEditing({ key: cursor, field: "title" }),
        e: () => setEditing({ key: cursor, field: "title" }),
        d: () => setEditing({ key: cursor, field: "due" }),
        p: () => patchTodo(t, { priority: t.priority ? 0 : 1 }),
        c: () => calendar(t),
        m: () => setPicking(cursor),
        Backspace: () => remove(t),
        Delete: () => remove(t),
      };
      if (act[e.key]) { e.preventDefault(); act[e.key](); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const run = (cmd: ParsedCommand): string | void => {
    switch (cmd.kind) {
      case "search": return setQ(cmd.query.trim());
      case "help": return void setTimeout(() => setHelp(true));
      case "sort": return "Todos sort themselves: priority, then soonest.";
      case "filter": return "Nothing to filter here - try :s to search.";
      case "run":
        if (cmd.name === "new") {
          if (!cmd.arg) return void setTimeout(() => composer.current?.focus());
          return void add(cmd.arg);
        }
        if (cmd.name === "sync") return notion.connected ? void sync() : "Connect Notion in Preferences first.";
        if (cmd.name === "done") return setShowDone((v) => !v);
        if (cmd.name === "clear") return setQ("");
    }
  };

  const add = async (text: string): Promise<boolean> => {
    const res = await createTodo(text);
    if ("error" in res) {
      say(res.error);
      return false;
    }
    if ("movedTo" in res) say(`Added to ${res.movedTo} in Studio`);
    else putTodo(res.row);
    return true;
  };

  /* ── Drawing ───────────────────────────────────────────────────────── */

  const hl = (text: string) => {
    const ranges = highlightRanges(text, "title", query);
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

  const ref = (key: Key) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(key, el);
    else rowRefs.current.delete(key);
  };

  const open = todos.filter((t) => !t.doneAt);
  const overdue = open.filter((t) => groupOf(t, now) === "overdue").length;
  const today = open.filter((t) => groupOf(t, now) === "today").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Everything else</Eyebrow>
          <h1 className="font-display mt-1 text-[34px] leading-10 font-semibold tracking-tight text-n-900">Todo</h1>
          <p className="mt-1 text-[13px] text-n-500">
            <span className="font-num">{open.length}</span> open
            {today > 0 && <> · <span className="font-num">{today}</span> today</>}
            {overdue > 0 && <> · <span className="font-num font-semibold text-danger">{overdue}</span> overdue</>}
          </p>
        </div>
        <p className="flex items-center gap-3 text-[11.5px] text-n-400">
          <span className="flex items-center gap-1.5"><Kbd>n</Kbd> new</span>
          <span className="flex items-center gap-1.5"><Kbd>:</Kbd> commands</span>
          <span className="flex items-center gap-1.5"><Kbd>?</Kbd> keys</span>
        </p>
      </div>

      <Composer inputRef={composer} courses={courses} onAdd={add} />

      {q && (
        <p className="text-[12.5px] text-n-500">
          Searching <b className="font-num text-n-800">{q}</b> ·{" "}
          <button type="button" onClick={() => setQ("")} className="text-rust-600 underline-offset-2 hover:underline">clear</button>
        </p>
      )}

      {notion.connected ? (
        (shownInbox.length > 0 || pull.error) && (
          <section className="animate-fade-in">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <Eyebrow>
                From Notion <span className="font-num text-rust-600">{shownInbox.length}</span>
              </Eyebrow>
              <span className="flex items-center gap-2 text-[11.5px] text-n-400">
                {pull.error ? <span className="text-danger">{pull.error}</span> : notion.lastPulledAt && <>Pulled {fmtAgo(notion.lastPulledAt, now)}</>}
                <button type="button" onClick={sync} disabled={pull.busy} className="font-medium text-rust-600 hover:underline disabled:opacity-50">
                  {pull.busy ? "Pulling…" : "Pull now"}
                </button>
              </span>
            </div>
            <ul className="rounded-lg border border-rust-200 bg-rust-50/60">
              {shownInbox.map((item) => {
                const key = `inbox:${item.id}` as Key;
                const course = courses.find((c) => c.id === item.courseId);
                const active = cursor === key;
                return (
                  <li
                    key={item.id}
                    ref={ref(key)}
                    onMouseDown={() => setCursor(key)}
                    className={clsx("relative border-b border-rust-100 px-4 last:border-b-0", active && "bg-rust-100/60")}
                  >
                    <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-rust-500" />
                      <span className="min-w-0 flex-1 basis-[180px] truncate text-[13.5px] text-n-800">
                        {editing?.key === key && editing.field === "title" ? (
                          <InlineInput initial={item.title} onDone={(v) => { setEditing(null); if (v !== undefined) patchInbox(item, { title: v }); }} />
                        ) : hl(item.title)}
                      </span>
                      {/* Every property, visible and clickable - the keys are a shortcut, not the only way. */}
                      <span className="flex shrink-0 items-center gap-1.5">
                        {editing?.key === key && editing.field === "due" ? (
                          <DueInput initial={item.dueAt} now={now} onDone={(d) => { setEditing(null); if (d !== undefined) patchInbox(item, { dueAt: d }); }} />
                        ) : (
                          <PropChip
                            set={!!item.dueAt}
                            title="Due date (d)"
                            onClick={() => { setCursor(key); setEditing({ key, field: "due" }); }}
                          >
                            {item.dueAt ? <Due at={item.dueAt} now={now} /> : <><Plus /> Date</>}
                          </PropChip>
                        )}
                        <PropChip set={!!course} title="Studio course (m) - entering it sends it there" onClick={() => { setCursor(key); setPicking(key); }}>
                          {course ? (
                            <>
                              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: cssColour(course.colour) }} />
                              {course.shortName}
                            </>
                          ) : <><Plus /> Course</>}
                        </PropChip>
                        <PropChip set={item.priority} title="Priority (p)" onClick={() => { setCursor(key); patchInbox(item, { priority: !item.priority }); }}>
                          <span className={clsx("font-num font-bold", item.priority ? "text-rust-700" : "")}>!</span>
                        </PropChip>
                        <PropChip
                          set={item.toCalendar}
                          title={item.toCalendar ? "Goes on your Google Calendar when entered (c)" : "Put it on your Google Calendar too (c)"}
                          onClick={() => { setCursor(key); patchInbox(item, { toCalendar: !item.toCalendar }); }}
                        >
                          <CalendarMark on={item.toCalendar} title="" />
                        </PropChip>
                        <button
                          type="button"
                          onClick={() => enter(item)}
                          title="Enter it into your todos (↵)"
                          className="ml-1 rounded-md bg-rust-500 px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600"
                        >
                          Enter
                        </button>
                      </span>
                    </div>
                    {active && !editing && picking !== key && (
                      <p className="animate-fade-in -mt-0.5 flex flex-wrap gap-x-3 gap-y-1 pb-2 pl-[18px] text-[11px] text-n-500">
                        <span><Kbd>d</Kbd> date</span>
                        <span><Kbd>m</Kbd> course</span>
                        <span><Kbd>p</Kbd> priority</span>
                        <span><Kbd>c</Kbd> calendar</span>
                        <span><Kbd>e</Kbd> rename</span>
                        <span><Kbd>↵</Kbd> enter</span>
                        <span><Kbd>⌫</Kbd> dismiss</span>
                      </p>
                    )}
                    {picking === key && (
                      <CoursePicker
                        courses={courses}
                        current={item.courseId}
                        onDone={(id) => { setPicking(null); if (id !== undefined) patchInbox(item, { courseId: id }); }}
                      />
                    )}
                  </li>
                );
              })}
              {!shownInbox.length && <li className="px-4 py-3 text-[12.5px] text-n-500">Nothing waiting.</li>}
            </ul>
          </section>
        )
      ) : (
        <p className="text-[12px] text-n-400">
          <Link href={`${LIVIO_BASE}/preferences` as Route} className="text-rust-600 underline-offset-2 hover:underline">Connect Notion</Link>{" "}
          to pull in todos you jot down on your phone.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key}>
          <Eyebrow className={clsx("mb-2", g.key === "overdue" && "text-danger")}>
            {g.label} <span className="font-num text-n-400">{g.items.length}</span>
          </Eyebrow>
          <ul className="rounded-lg border border-n-100 bg-n-0">
            {g.items.map((t) => (
              <TodoItem
                key={t.id}
                t={t}
                now={now}
                active={cursor === `todo:${t.id}`}
                editing={editing?.key === `todo:${t.id}` ? editing.field : null}
                picking={picking === `todo:${t.id}`}
                courses={courses}
                hl={hl}
                rowRef={ref(`todo:${t.id}`)}
                onPoint={() => setCursor(`todo:${t.id}`)}
                onToggle={() => toggle(t)}
                onEdited={(patch) => { setEditing(null); if (patch) patchTodo(t, patch); }}
                onPicked={(id) => { setPicking(null); if (id) patchTodo(t, { courseId: id }); }}
              />
            ))}
          </ul>
        </section>
      ))}

      {!groups.length && (
        <div className="rounded-lg border border-n-100 bg-n-0 px-6 py-12 text-center">
          {q ? (
            <p className="text-[13px] text-n-500">Nothing matches “{q}”.</p>
          ) : (
            <>
              <p className="font-display text-[18px] font-semibold text-n-800">All clear</p>
              <p className="mt-1.5 text-[13px] text-n-500">Press <Kbd>n</Kbd> to write one down.</p>
            </>
          )}
        </div>
      )}

      {done.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-n-400 transition-colors hover:text-n-600"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden className={clsx("transition-transform", showDone && "rotate-90")}>
              <path d="M3 1.5L6.5 5 3 8.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
            Done <span className="font-num">{done.length}</span>
          </button>
          {showDone && (
            <ul className="animate-fade-in rounded-lg border border-n-100 bg-n-0">
              {done.map((t) => (
                <TodoItem
                  key={t.id}
                  t={t}
                  now={now}
                  active={cursor === `todo:${t.id}`}
                  editing={editing?.key === `todo:${t.id}` ? editing.field : null}
                  picking={picking === `todo:${t.id}`}
                  courses={courses}
                  hl={hl}
                  rowRef={ref(`todo:${t.id}`)}
                  onPoint={() => setCursor(`todo:${t.id}`)}
                  onToggle={() => toggle(t)}
                  onEdited={(patch) => { setEditing(null); if (patch) patchTodo(t, patch); }}
                  onPicked={(id) => { setPicking(null); if (id) patchTodo(t, { courseId: id }); }}
                />
              ))}
            </ul>
          )}
        </section>
      )}

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
      {toast && <UndoToast message={toast.message} onUndo={toast.undo} onDone={() => setToast(null)} />}
    </div>
  );
}

function TodoItem({
  t, now, active, editing, picking, courses, hl, rowRef, onPoint, onToggle, onEdited, onPicked,
}: {
  t: TodoRow;
  now: Date;
  active: boolean;
  editing: "title" | "due" | null;
  picking: boolean;
  courses: TodoCourse[];
  hl: (text: string) => React.ReactNode;
  rowRef: (el: HTMLElement | null) => void;
  onPoint: () => void;
  onToggle: () => void;
  onEdited: (patch: TodoPatch | null) => void;
  onPicked: (courseId: string | null | undefined) => void;
}) {
  const done = !!t.doneAt;
  return (
    <li
      ref={rowRef}
      onMouseDown={onPoint}
      className={clsx(
        "group relative flex min-h-11 items-center gap-3 border-b border-n-100 px-4 last:border-b-0",
        active && "bg-n-50",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? `Mark “${t.title}” not done` : `Mark “${t.title}” done`}
        className={clsx(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-[120ms]",
          done ? "border-rust-500 bg-rust-500 text-white" : "border-n-300 hover:border-rust-400",
        )}
      >
        {done && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M2 5.2l2 2L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className={clsx("min-w-0 flex-1 truncate text-[13.5px]", done ? "text-n-400 line-through decoration-n-300" : "text-n-800")}>
        {editing === "title" ? (
          <InlineInput initial={t.title} onDone={(v) => onEdited(v !== undefined ? { title: v } : null)} />
        ) : hl(t.title)}
      </span>
      {t.priority > 0 && !done && <Priority />}
      {t.notionPageId && (
        <span title="From Notion - ticking it off marks it Done there too" className="font-num text-[10px] font-semibold text-n-300">N</span>
      )}
      {editing === "due" ? (
        <DueInput initial={t.dueAt} now={now} onDone={(d) => onEdited(d !== undefined ? { dueAt: d } : null)} />
      ) : (
        !done && <Due at={t.dueAt} now={now} />
      )}
      {t.calendarEventId && <CalendarMark on title="On your Google Calendar" />}
      {picking && <CoursePicker courses={courses} current={null} onDone={onPicked} />}
    </li>
  );
}

/** One of an inbox item's properties: filled when set, a faint dashed
 *  placeholder when not. Clicking edits it. */
function PropChip({ set, title, onClick, children }: { set: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        "flex h-6 items-center gap-1 rounded-full border px-2 text-[11.5px] transition-colors duration-[120ms]",
        set
          ? "border-rust-200 bg-n-0 text-n-700 hover:border-rust-300"
          : "border-dashed border-n-300 text-n-400 hover:border-rust-300 hover:text-n-600",
      )}
    >
      {children}
    </button>
  );
}

function Plus() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
      <path d="M4 1v6M1 4h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Priority() {
  return (
    <span title="Priority" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rust-100 font-num text-[10px] font-bold text-rust-700">
      !
    </span>
  );
}

function Due({ at, now }: { at: Date | null; now: Date }) {
  if (!at) return null;
  const g = groupOf({ dueAt: at }, now);
  return (
    <span
      title={fmtDayDate(at)}
      className={clsx(
        "shrink-0 font-num text-[12px]",
        g === "overdue" ? "font-semibold text-danger" : g === "today" ? "font-semibold text-rust-600" : "text-n-500",
      )}
    >
      {dueLabel(at, now)}
    </span>
  );
}

function CalendarMark({ on, title }: { on: boolean; title: string }) {
  return (
    <span title={title || undefined} className={clsx("shrink-0", on ? "text-rust-500" : "text-n-300")}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Text edited in place: ↵ saves, Esc leaves it as it was. */
function InlineInput({ initial, onDone }: { initial: string; onDone: (v: string | undefined) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (v: string | undefined) => {
    if (done.current) return;
    done.current = true;
    onDone(v === initial || !v?.trim() ? undefined : v);
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
      }}
      {...NO_AUTOFILL}
      className="w-full rounded bg-n-0 px-1.5 py-0.5 text-[13.5px] text-n-800 outline-none shadow-[inset_0_0_0_1.5px_var(--color-rust-500)]"
    />
  );
}

/** A due date typed in words, with what it'll be read as beside it. */
function DueInput({ initial, now, onDone }: { initial: Date | null; now: Date; onDone: (d: Date | null | undefined) => void }) {
  const [value, setValue] = useState(dueText(initial));
  const parsed = parseDue(value, now);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current || (commit && parsed === undefined)) return;
    done.current = true;
    onDone(commit && value !== dueText(initial) ? parsed : undefined);
  };
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className={clsx("text-[11.5px]", parsed === undefined ? "text-danger" : "text-n-500")}>
        {parsed === undefined ? "Not a date" : parsed === null ? "No date" : `${fmtDayDate(parsed)}${hasTime(parsed) ? ` ${fmtHM(parsed)}` : ""}`}
      </span>
      <input
        autoFocus
        value={value}
        placeholder="fri 5pm"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(parsed !== undefined)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); finish(true); }
          else if (e.key === "Escape") { e.preventDefault(); finish(false); }
        }}
        {...NO_AUTOFILL}
        className="w-[120px] rounded bg-n-0 px-1.5 py-0.5 font-num text-[12px] text-n-800 outline-none placeholder:text-n-400 shadow-[inset_0_0_0_1.5px_var(--color-rust-500)]"
      />
    </span>
  );
}

/**
 * Which Studio course this belongs to. Picking one moves the todo into
 * Studio; "Livio" keeps it here. Type to narrow, ↑↓ and ↵ to choose.
 */
function CoursePicker({ courses, current, onDone }: {
  courses: TodoCourse[];
  current: string | null;
  onDone: (courseId: string | null | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const options = [{ id: null as string | null, label: "Livio - no course", colour: null as string | null }].concat(
    courses.map((c) => ({ id: c.id, label: `${c.shortName} · ${c.name}`, colour: c.colour })),
  ).filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));
  const [active, setActive] = useState(0);
  const done = useRef(false);
  const finish = (id: string | null | undefined) => {
    if (done.current) return;
    done.current = true;
    onDone(id === current ? undefined : id);
  };
  return (
    <div className="animate-scale-in absolute right-3 top-full z-30 mt-1 w-[280px] origin-top-right rounded-md border border-n-100 bg-n-0 p-1 shadow-[var(--shadow-pop)]">
      <input
        autoFocus
        value={query}
        placeholder="Move to…"
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        onBlur={() => finish(undefined)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); if (options[active]) finish(options[active].id); }
          else if (e.key === "Escape") { e.preventDefault(); finish(undefined); }
        }}
        {...NO_AUTOFILL}
        className="mb-1 w-full rounded bg-n-50 px-2.5 py-1.5 text-[12.5px] text-n-800 outline-none placeholder:text-n-400"
      />
      <ul role="listbox" className="max-h-[240px] overflow-y-auto">
        {options.map((o, i) => (
          <li key={o.id ?? "livio"}>
            <button
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); finish(o.id); }}
              onMouseEnter={() => setActive(i)}
              className={clsx("flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px]", i === active ? "bg-rust-50 text-rust-700" : "text-n-700")}
            >
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.colour ? cssColour(o.colour) : "var(--color-rust-500)" }} />
              <span className="truncate">{o.label}</span>
              {o.id === current && <span className="ml-auto text-n-400">✓</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One line, a whole todo: "renew railcard fri 5pm !". What's been understood
 * shows underneath as it's typed. @course sends it to Studio instead.
 */
function Composer({ inputRef, courses, onAdd }: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  courses: TodoCourse[];
  onAdd: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const parsed = useMemo(() => parseTodo(text, courses), [text, courses]);
  const course = courses.find((c) => c.id === parsed.courseId);
  const due = text.trim() ? parseDue([parsed.dueDate, parsed.dueTime].filter(Boolean).join(" ")) : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        start(async () => {
          if (await onAdd(text)) setText("");
        });
      }}
      className="rounded-lg border border-n-100 bg-n-0 px-4 py-2.5 transition-colors focus-within:border-rust-300"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-n-300 text-n-400">
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
            <path d="M4 1v6M1 4h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setText(""); e.currentTarget.blur(); }
          }}
          disabled={pending}
          placeholder="Write it down - try “renew railcard fri 5pm !”"
          {...NO_AUTOFILL}
          className="h-7 min-w-0 flex-1 bg-transparent text-[13.5px] text-n-800 outline-none placeholder:text-n-400"
        />
        {text.trim() && <span className="hidden items-center gap-1 text-[11px] text-n-400 sm:flex"><Kbd>↵</Kbd> add</span>}
      </div>
      {text.trim() && (due || parsed.priority || course) && (
        <div className="animate-fade-in mt-1.5 flex flex-wrap items-center gap-1.5 pl-[30px] text-[11.5px]">
          {due && <span className="rounded-full bg-n-50 px-2 py-0.5 font-num text-n-600">{fmtDayDate(due)}{hasTime(due) && ` ${fmtHM(due)}`}</span>}
          {parsed.priority && <span className="rounded-full bg-rust-100 px-2 py-0.5 font-semibold text-rust-700">Priority</span>}
          {course && (
            <span className="flex items-center gap-1.5 rounded-full bg-n-50 px-2 py-0.5 text-n-600">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: cssColour(course.colour) }} />
              Goes to {course.shortName} in Studio
            </span>
          )}
        </div>
      )}
    </form>
  );
}
