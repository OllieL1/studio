"use client";

import { fmtWeight } from "@/lib/format";
import { Fragment, useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { CalendarItem } from "@/lib/calendar";
import type { PlanBlockView } from "@/lib/planData";
import { addDays, isSameDay, parseLocalDate, startOfWeek, toISODate } from "@/lib/dates";
import { TASK_KIND_LABEL } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { cssColour } from "@/lib/palette";
import { fmtLength, fmtMinutes, rangeHref } from "@/lib/plan";
import { blockKey, buildDays, dayJump, GAP_WORTH_SHOWING, navKeys, nowKey, sleepItems, timeLabel, type PlanDay, type Row, type Sleep } from "@/lib/planView";
import { createBlock, deleteBlock, restoreBlock, setHidden, setSleep, syncRange, updateBlock, type BlockInput } from "@/app/planActions";
import { WeekGrid } from "../calendar/WeekGrid";
import { Composer, Key, TimeField, type ComposerCourse, type ComposerResult } from "./Composer";
import { SyncBar } from "./SyncBar";

type Draft = {
  iso: string;
  /** The row it was opened from, and which side of it. */
  anchorKey: string | null;
  anchor: { start: number; end: number } | null;
  direction: "below" | "above";
  editing: PlanBlockView | null;
};

type BlockOp =
  | { type: "add"; block: PlanBlockView }
  | { type: "update"; block: PlanBlockView }
  | { type: "remove"; id: string };

type Undo =
  | { type: "block"; block: PlanBlockView; label: string }
  /** `key` is what's hidden (the event); `row` is where the cursor goes back to. */
  | { type: "fixed"; key: string; row: string; label: string };

export function PlanEditor({
  from: fromISO,
  days: dayCount,
  fixed,
  blocks: serverBlocks,
  hidden: serverHidden,
  removed,
  courses,
  googleConnected,
  googleError,
  calendar,
  sleep: serverSleep,
}: {
  from: string;
  days: number;
  fixed: CalendarItem[];
  blocks: PlanBlockView[];
  hidden: string[];
  removed: number;
  courses: ComposerCourse[];
  googleConnected: boolean;
  googleError: string | null;
  calendar: { id: string; name: string | null } | null;
  sleep: Sleep;
}) {
  const router = useRouter();
  const from = useMemo(() => parseLocalDate(fromISO), [fromISO]);
  const [, startTransition] = useTransition();

  const [blocks, applyBlock] = useOptimistic(serverBlocks, (list: PlanBlockView[], op: BlockOp) => {
    if (op.type === "add") return [...list, op.block];
    if (op.type === "update") return list.map((b) => (b.id === op.block.id ? op.block : b));
    return list.filter((b) => b.id !== op.id);
  });
  const [hidden, applyHidden] = useOptimistic(new Set(serverHidden), (set: Set<string>, op: { key: string; on: boolean }) => {
    const next = new Set(set);
    if (op.on) next.add(op.key); else next.delete(op.key);
    return next;
  });

  const [showHidden, setShowHidden] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  // ⌘ on a Mac, Ctrl elsewhere - the stick runs on both.
  const [mod, setMod] = useState("⌘");
  useEffect(() => { if (!/Mac|iPhone|iPad/.test(navigator.userAgent)) setMod("Ctrl+"); }, []);
  // A new block is shown under a temporary id until the server answers;
  // the cursor follows it across the swap.
  const alias = useRef(new Map<string, string>());

  const [sleep, applySleep] = useOptimistic(serverSleep, (_: Sleep, next: Sleep) => next);
  // Sleep sits in the days like any fixed event, so free time is counted
  // around it - but it's only ever drawn here, never synced or printed.
  const withSleep = useMemo(() => [...fixed, ...sleepItems(from, dayCount, sleep)], [fixed, from, dayCount, sleep]);
  const changeSleep = (next: Sleep) => startTransition(async () => {
    applySleep(next);
    await setSleep(next);
  });

  const days = useMemo(
    () => buildDays({ from, days: dayCount, fixed: withSleep, blocks, hidden, showHidden }),
    [from, dayCount, withSleep, blocks, hidden, showHidden],
  );
  const keys = useMemo(() => navKeys(days), [days]);
  const resolve = useCallback((key: string | null) => {
    if (!key) return null;
    if (keys.includes(key)) return key;
    const a = alias.current.get(key);
    return a && keys.includes(a) ? a : null;
  }, [keys]);
  const current = resolve(cursor);

  // Start on today's first entry when today is in range, else the first day's.
  useEffect(() => {
    const today = days.find((d) => isSameDay(d.date, new Date())) ?? days[0];
    let wantsNow = false;
    try {
      wantsNow = sessionStorage.getItem("plan:now") === "1";
      sessionStorage.removeItem("plan:now");
    } catch {}
    setCursor((wantsNow ? nowKey(days, new Date()) : null) ?? today?.rows[0].key ?? null);
    // Only when the range changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromISO, dayCount]);

  // Keep the selected row on screen.
  useEffect(() => {
    if (current) document.getElementById(rowId(current))?.scrollIntoView({ block: "nearest" });
  }, [current]);

  // Preview open/closed is remembered per browser.
  useEffect(() => {
    try { setPreview(localStorage.getItem("plan:preview") === "1"); } catch {}
  }, []);
  const togglePreview = useCallback(() => {
    setPreview((v) => {
      try { localStorage.setItem("plan:preview", v ? "0" : "1"); } catch {}
      return !v;
    });
  }, []);

  const findRow = useCallback((key: string) => {
    for (const d of days) {
      const row = d.rows.find((r) => r.key === key);
      if (row) return { day: d, row };
    }
    return null;
  }, [days]);

  /* ── Actions ─────────────────────────────────────────────────────────── */

  const openComposer = useCallback((key: string, direction: "below" | "above") => {
    const found = findRow(key);
    if (!found) return;
    const { day, row } = found;
    if (row.type === "empty") {
      setDraft({ iso: day.iso, anchorKey: row.key, anchor: null, direction: "below", editing: null });
    } else {
      setDraft({ iso: day.iso, anchorKey: row.key, anchor: { start: row.start, end: row.end }, direction, editing: null });
    }
  }, [findRow]);

  const editRow = useCallback((key: string) => {
    const found = findRow(key);
    if (!found || found.row.type !== "block") return;
    setDraft({ iso: found.day.iso, anchorKey: key, anchor: null, direction: "below", editing: found.row.block });
  }, [findRow]);

  const save = (d: Draft, r: ComposerResult) => {
    setDraft(null);
    setError(null);
    const day = parseLocalDate(d.iso);
    const at = (m: number) => new Date(day.getTime() + m * 60_000).toISOString();
    const input: BlockInput = { title: r.title, courseId: r.courseId, date: d.iso, start: r.start, end: r.end };
    if (d.editing) {
      const id = d.editing.id;
      setCursor(blockKey(id));
      startTransition(async () => {
        applyBlock({ type: "update", block: { ...d.editing!, title: r.title, courseId: r.courseId, start: at(r.start), end: at(r.end), state: d.editing!.state === "new" ? "new" : "changed" } });
        const res = await updateBlock(id, input);
        if (!res.ok) setError(res.error);
      });
    } else {
      const temp = `tmp-${Date.now()}`;
      setCursor(blockKey(temp));
      startTransition(async () => {
        applyBlock({ type: "add", block: { id: temp, title: r.title, courseId: r.courseId, start: at(r.start), end: at(r.end), state: "new" } });
        const res = await createBlock(input);
        if (res.ok) {
          alias.current.set(blockKey(res.block.id), blockKey(temp));
          setCursor(blockKey(res.block.id));
        } else setError(res.error);
      });
    }
  };

  const remove = useCallback((key: string) => {
    const found = findRow(key);
    if (!found || found.row.type === "empty") return;
    const { row } = found;
    // The cursor moves on to the next row (or back, at the end).
    const i = keys.indexOf(key);
    setCursor(keys[i + 1] ?? keys[i - 1] ?? null);
    setError(null);

    if (row.type === "block") {
      const block = row.block;
      setUndo({ type: "block", block, label: block.title });
      startTransition(async () => {
        applyBlock({ type: "remove", id: block.id });
        await deleteBlock(block.id);
      });
    } else if (row.hidden) {
      // Already left off and shown struck through: Backspace puts it back.
      setCursor(key);
      startTransition(async () => {
        applyHidden({ key: row.item.id, on: false });
        await setHidden(row.item.id, false);
      });
    } else {
      // Hiding is by event, so both halves of an overnight shift go together.
      setUndo({ type: "fixed", key: row.item.id, row: key, label: row.item.title });
      startTransition(async () => {
        applyHidden({ key: row.item.id, on: true });
        await setHidden(row.item.id, true);
      });
    }
  }, [findRow, keys, applyBlock, applyHidden]);

  const hideChip = (item: CalendarItem, on: boolean) => {
    if (on) setUndo({ type: "fixed", key: item.id, row: item.id, label: item.title });
    startTransition(async () => {
      applyHidden({ key: item.id, on });
      await setHidden(item.id, on);
    });
  };

  const runUndo = useCallback(() => {
    if (!undo) return;
    setUndo(null);
    if (undo.type === "fixed") {
      setCursor(undo.row);
      startTransition(async () => {
        applyHidden({ key: undo.key, on: false });
        await setHidden(undo.key, false);
      });
    } else {
      const b = undo.block;
      const start = new Date(b.start);
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const mins = (iso: string) => Math.round((new Date(iso).getTime() - day.getTime()) / 60000);
      setCursor(blockKey(b.id));
      startTransition(async () => {
        applyBlock({ type: "add", block: b });
        const res = await restoreBlock(b.id, { title: b.title, courseId: b.courseId, date: toISODate(day), start: mins(b.start), end: mins(b.end) });
        if (res.ok && res.block.id !== b.id) {
          alias.current.set(blockKey(res.block.id), blockKey(b.id));
          setCursor(blockKey(res.block.id));
        }
      });
    }
  }, [undo, applyBlock, applyHidden]);

  // The undo offer fades after a while.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);

  /* ── Keyboard ────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !typing && undo) {
        e.preventDefault();
        runUndo();
        return;
      }
      if (typing || draft || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog]")) return;

      const i = current ? keys.indexOf(current) : -1;
      const go = (k: string | null | undefined) => { if (k) { e.preventDefault(); setCursor(k); } };

      switch (e.key) {
        case "ArrowDown": case "j": return go(keys[Math.min(keys.length - 1, i + 1)] ?? keys[0]);
        case "ArrowUp": case "k": return go(keys[Math.max(0, i - 1)] ?? keys[0]);
        case "ArrowRight": case "ArrowLeft": {
          const dir = e.key === "ArrowRight" ? 1 : -1;
          if (!e.shiftKey) return go(dayJump(days, current, dir));
          e.preventDefault();
          return router.push(rangeHref(addDays(from, dir * dayCount), dayCount) as Route);
        }
        case "Home": return go(keys[0]);
        case "End": return go(keys[keys.length - 1]);
        case "t": case "T": {
          const today = days.find((d) => isSameDay(d.date, new Date()));
          if (today) return go(today.rows[0].key);
          e.preventDefault();
          return router.push(rangeHref(dayCount === 7 ? startOfWeek(new Date()) : new Date(), dayCount) as Route);
        }
        case "n": case "N": {
          e.preventDefault();
          const key = nowKey(days, new Date());
          if (key) return go(key);
          try { sessionStorage.setItem("plan:now", "1"); } catch {}
          return router.push(rangeHref(dayCount === 7 ? startOfWeek(new Date()) : new Date(), dayCount) as Route);
        }
        case "g": case "G":
          e.preventDefault();
          return syncRef.current();
        case "Enter":
          if (!current) return;
          e.preventDefault();
          return openComposer(current, e.shiftKey ? "above" : "below");
        case "e": case "F2":
          if (!current) return;
          e.preventDefault();
          return editRow(current);
        case "Backspace": case "Delete":
          if (!current) return;
          e.preventDefault();
          return remove(current);
        case "p":
          e.preventDefault();
          return togglePreview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, days, current, draft, undo, openComposer, editRow, remove, runUndo, togglePreview, router, from, dayCount]);

  /* ── Render ──────────────────────────────────────────────────────────── */

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const previewItems = useMemo(() => {
    const items: CalendarItem[] = fixed.filter((f) => !hidden.has(f.id));
    for (const b of blocks) {
      const c = b.courseId ? courseById.get(b.courseId) : null;
      items.push({
        id: `plan-${b.id}`, source: "plan", title: b.title, start: b.start, end: b.end, allDay: false,
        colour: c?.colour ?? null, courseShort: c?.shortName ?? null, courseId: b.courseId, href: null,
        blocked: false, done: false, kind: null, gradeWeight: null, location: null, editable: false,
        onGoogle: b.state !== "new", notes: null,
      });
    }
    return items;
  }, [fixed, blocks, hidden, courseById]);

  const pending = {
    new: blocks.filter((b) => b.state === "new").length,
    changed: blocks.filter((b) => b.state === "changed").length,
    removed,
  };

  const [syncing, startSync] = useTransition();
  const [syncResult, setSyncResult] = useState<{ ok: boolean; text: string } | null>(null);
  const syncRef = useRef<() => void>(() => {});
  const sync = () => {
    setSyncResult(null);
    startSync(async () => {
      const res = await syncRange(fromISO, dayCount);
      if (!res.ok) { setSyncResult({ ok: false, text: res.error ?? "Couldn't sync." }); return; }
      const parts = [
        res.created && `${res.created} added`,
        res.updated && `${res.updated} updated`,
        res.removed && `${res.removed} removed`,
      ].filter(Boolean);
      setSyncResult({ ok: true, text: parts.length ? `Synced - ${parts.join(", ")}.` : "Already in sync." });
    });
  };

  syncRef.current = () => {
    if (googleConnected && calendar && !syncing && pending.new + pending.changed + pending.removed > 0) sync();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="min-w-0 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={togglePreview}
            aria-expanded={preview}
            className={clsx(
              "flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold transition-colors duration-[120ms]",
              preview ? "border-n-200 bg-n-100 text-n-800" : "border-n-200 bg-n-0 text-n-700 hover:bg-n-50",
            )}
          >
            <GridIcon />
            {preview ? "Hide calendar view" : "Calendar view"}
          </button>
          <a
            href={`/api/plan/pdf?from=${fromISO}&days=${dayCount}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-9 items-center gap-2 rounded-[10px] border border-n-200 bg-n-0 px-3 text-[13px] font-semibold text-n-700 transition-colors duration-[120ms] hover:bg-n-50"
          >
            <PdfIcon />
            Export PDF
          </a>
          {error && <span className="text-[12px] font-medium text-danger">{error}</span>}
        </div>

        {preview && (
          <div className="animate-fade-in">
            <WeekGrid
              anchor={from}
              days={days.map((d) => d.date)}
              items={previewItems}
              readOnly
            />
          </div>
        )}

        <div role="listbox" aria-label="Schedule" aria-activedescendant={current ? rowId(current) : undefined} className="space-y-4">
          {days.map((day) => (
            <DaySection
              key={day.iso}
              day={day}
              courses={courseById}
              current={current}
              draft={draft?.iso === day.iso ? draft : null}
              revealHidden={showHidden.has(day.iso)}
              onToggleHidden={() => setShowHidden((s) => {
                const n = new Set(s);
                if (n.has(day.iso)) n.delete(day.iso); else n.add(day.iso);
                return n;
              })}
              onSelect={setCursor}
              onCompose={openComposer}
              onEdit={editRow}
              onRemove={remove}
              onHideChip={hideChip}
              composer={(d) => (
                <Composer
                  key={`${d.anchorKey}-${d.direction}-${d.editing?.id ?? ""}`}
                  courses={courses}
                  anchor={d.anchor}
                  direction={d.direction}
                  initial={d.editing ? blockResult(d.editing, day.date) : undefined}
                  clashesWith={(slot) => clashes(day, slot, d.editing ? blockKey(d.editing.id) : null)}
                  onSave={(r) => save(d, r)}
                  onCancel={() => setDraft(null)}
                />
              )}
            />
          ))}
        </div>

        <SyncBar
          googleConnected={googleConnected}
          googleError={googleError}
          calendar={calendar}
          pending={pending}
          syncing={syncing}
          result={syncResult}
          onSync={sync}
        />
      </div>

      <Sidebar days={days} courses={courseById} mod={mod} sleep={sleep} onSleep={changeSleep} />

      {undo && (
        <div role="status" className="animate-fade-up fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-n-200 bg-n-900 py-1.5 pl-4 pr-1.5 text-[12.5px] text-n-0 shadow-[var(--shadow-modal)]">
          <span className="max-w-[260px] truncate">
            {undo.type === "block" ? "Removed" : "Left off"} <span className="font-semibold">{undo.label}</span>
          </span>
          <button onClick={runUndo} className="rounded-full bg-n-0/15 px-3 py-1 text-[12px] font-semibold hover:bg-n-0/25">
            Undo <span className="font-num opacity-60">{mod}Z</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── A day ─────────────────────────────────────────────────────────────── */

function DaySection({
  day, courses, current, draft, revealHidden, onToggleHidden,
  onSelect, onCompose, onEdit, onRemove, onHideChip, composer,
}: {
  day: PlanDay<PlanBlockView>;
  courses: Map<string, ComposerCourse>;
  current: string | null;
  draft: Draft | null;
  revealHidden: boolean;
  onToggleHidden: () => void;
  onSelect: (key: string) => void;
  onCompose: (key: string, dir: "below" | "above") => void;
  onEdit: (key: string) => void;
  onRemove: (key: string) => void;
  onHideChip: (item: CalendarItem, on: boolean) => void;
  composer: (d: Draft) => React.ReactNode;
}) {
  const today = isSameDay(day.date, new Date());
  const past = !today && day.date < new Date();
  const lastKey = day.rows[day.rows.length - 1].key;

  // Where the open composer sits: beside its anchor, or in place of the block being edited.
  const before = (key: string) => draft && !draft.editing && draft.direction === "above" && draft.anchorKey === key;
  const after = (key: string) => draft && !draft.editing && draft.direction === "below" && draft.anchorKey === key;
  const instead = (key: string) => draft?.editing && blockKey(draft.editing.id) === key;

  let lastEnd = -1;
  // The entry that runs latest - the end-of-day free time is measured from it.
  const last = day.rows.reduce<Exclude<Row<PlanBlockView>, { type: "empty" }> | null>(
    (best, r) => (r.type !== "empty" && (!best || r.end > best.end) ? r : best),
    null,
  );

  return (
    <section
      aria-label={day.date.toDateString()}
      className={clsx("card overflow-hidden", today && "border-rust-200")}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-n-100 px-4 pb-2.5 pt-3">
        <h2 className={clsx("font-display text-[19px] font-semibold leading-6", past ? "text-n-500" : "text-n-900")}>
          {WEEKDAY[(day.date.getDay() + 6) % 7]}
        </h2>
        <span className="text-[13px] text-n-500">{day.date.getDate()} {MONTH[day.date.getMonth()]}</span>
        {today && <span className="eyebrow text-rust-600">Today</span>}
        <span className="ml-auto flex items-center gap-3 text-[11.5px] text-n-400">
          {day.hiddenCount > 0 && (
            <button onClick={onToggleHidden} className="font-medium hover:text-n-700">
              {revealHidden ? "Hide left-off" : `${day.hiddenCount} left off`}
            </button>
          )}
          {day.plannedMinutes > 0 && <span className="font-num">{fmtLength(day.plannedMinutes)} planned</span>}
          <button
            onClick={() => onCompose(lastKey, "below")}
            aria-label={`Add to ${WEEKDAY[(day.date.getDay() + 6) % 7]}`}
            className="flex h-6 w-6 items-center justify-center rounded-md text-n-400 transition-colors duration-[120ms] hover:bg-n-100 hover:text-n-700"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </span>
      </header>

      {day.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-n-100 bg-n-25 px-4 py-2">
          {day.chips.map(({ item, hidden }) => (
            <span
              key={item.id}
              className={clsx(
                "group/chip inline-flex max-w-full items-center gap-1.5 rounded-[5px] border-l-[3px] py-0.5 pl-1.5 pr-1 text-[11.5px]",
                hidden ? "text-n-400 line-through" : "text-n-700",
              )}
              style={{ borderColor: cssColour(item.colour) || (item.source === "google" ? "var(--color-info)" : "var(--color-n-400)"), background: "var(--color-n-0)" }}
            >
              {item.source === "deadline" && <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-n-500">Due</span>}
              {item.courseShort && <span className="font-medium" style={{ color: cssColour(item.colour) }}>{item.courseShort}</span>}
              <span className="truncate">{item.title}</span>
              {item.gradeWeight != null && <span className="font-num text-n-400">{fmtWeight(item.gradeWeight)}%</span>}
              <button
                onClick={() => onHideChip(item, !hidden)}
                aria-label={hidden ? `Put ${item.title} back` : `Leave ${item.title} off the plan`}
                className="rounded p-0.5 text-n-300 opacity-0 transition-opacity duration-[120ms] hover:text-n-600 focus-visible:opacity-100 group-hover/chip:opacity-100"
              >
                {hidden ? <RestoreIcon /> : <CrossIcon />}
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="px-2 py-1.5">
        {day.rows.map((row, idx) => {
          const prev = idx > 0 ? day.rows[idx - 1] : null;
          const gap = row.type !== "empty" && prev && prev.type !== "empty" ? row.start - Math.max(lastEnd, prev.end) : 0;
          if (row.type !== "empty") lastEnd = Math.max(lastEnd, row.end);
          return (
            <Fragment key={row.key}>
              {gap >= GAP_WORTH_SHOWING && !draft && prev && (
                <FreeGap minutes={gap} onClick={() => onCompose(prev.key, "below")} />
              )}
              {before(row.key) && composer(draft!)}
              {instead(row.key) ? composer(draft!) : (
                <RowView
                  row={row}
                  courses={courses}
                  selected={row.key === current}
                  onSelect={() => onSelect(row.key)}
                  onOpen={() => (row.type === "block" ? onEdit(row.key) : onCompose(row.key, "below"))}
                  onRemove={() => onRemove(row.key)}
                  hideForComposer={row.type === "empty" && !!after(row.key)}
                />
              )}
              {after(row.key) && composer(draft!)}
            </Fragment>
          );
        })}
        {/* And whatever's left of the evening, up to midnight. */}
        {last && 24 * 60 - last.end >= GAP_WORTH_SHOWING && !draft && (
          <FreeGap minutes={24 * 60 - last.end} onClick={() => onCompose(last.key, "below")} />
        )}
      </div>
    </section>
  );
}

/** "2h free" between entries - click it to fill it. */
function FreeGap({ minutes, onClick }: { minutes: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group/gap flex w-full items-center gap-3 px-2 py-0.5 text-left">
      <span className="w-[110px] shrink-0" />
      <span className="h-px flex-1 border-t border-dashed border-n-200" />
      <span className="font-num text-[10.5px] text-n-400 group-hover/gap:text-rust-600">{fmtLength(minutes)} free</span>
      <span className="h-px w-6 border-t border-dashed border-n-200" />
    </button>
  );
}

function RowView({
  row, courses, selected, onSelect, onOpen, onRemove, hideForComposer,
}: {
  row: Row<PlanBlockView>;
  courses: Map<string, ComposerCourse>;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onRemove: () => void;
  hideForComposer: boolean;
}) {
  if (row.type === "empty") {
    if (hideForComposer) return null;
    return (
      <div
        id={rowId(row.key)}
        role="option"
        aria-selected={selected}
        onClick={() => { onSelect(); onOpen(); }}
        className={clsx(
          "flex cursor-text scroll-mb-32 scroll-mt-24 items-center gap-3 rounded-md px-2 py-2.5 text-[13px] transition-colors duration-[120ms]",
          selected ? "bg-rust-50 text-rust-700 ring-1 ring-inset ring-rust-200" : "text-n-400 hover:bg-n-25",
        )}
      >
        <span className="w-[110px] shrink-0" />
        <span>Nothing planned{selected ? " - press Enter to add something" : ""}</span>
      </div>
    );
  }

  const isBlock = row.type === "block";
  const course = isBlock ? (row.block.courseId ? courses.get(row.block.courseId) : undefined) : undefined;
  const colour = isBlock
    ? (course ? cssColour(course.colour) : "var(--color-n-400)")
    : cssColour(row.item.colour) || (row.item.source === "google" ? "var(--color-info)" : "var(--color-n-400)");
  const hidden = row.type === "fixed" && row.hidden;
  const asleep = row.type === "fixed" && row.item.source === "sleep";
  // Sleep has no subtitle (unless it's been left off), so its one line is
  // centred against the time instead of hanging from the top.
  const oneLine = asleep && !hidden;

  return (
    <div
      id={rowId(row.key)}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={clsx(
        "group/row relative flex scroll-mb-32 scroll-mt-24 gap-3 rounded-md px-2 py-2 transition-colors duration-[120ms]",
        oneLine ? "items-center" : "items-start",
        selected ? "bg-rust-50 ring-1 ring-inset ring-rust-200" : "hover:bg-n-25",
      )}
    >
      <span className={clsx("font-num w-[110px] shrink-0 whitespace-nowrap text-[12.5px]", !oneLine && "pt-px", isBlock ? "font-semibold text-n-800" : asleep ? "text-n-400" : "text-n-500", hidden && "line-through")}>
        <TimeRange row={row} />
      </span>

      {/* Planned blocks are boxes, like the checkboxes they become on paper; fixed events are dots. */}
      {isBlock ? (
        <span aria-hidden className="mt-[3px] h-[13px] w-[13px] shrink-0 rounded-[4px] border-[1.5px]" style={{ borderColor: colour, background: `color-mix(in oklab, ${colour} 12%, var(--color-n-0))` }} />
      ) : asleep ? (
        <MoonIcon centred={oneLine} />
      ) : (
        <span aria-hidden className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: colour, opacity: hidden ? 0.4 : 1 }} />
      )}

      <div className="min-w-0 flex-1">
        <p className={clsx(
          "truncate text-[13.5px] leading-5",
          isBlock ? "font-semibold text-n-900" : hidden ? "text-n-400 line-through" : asleep ? "text-n-500" : "text-n-700",
        )}>
          {isBlock ? row.block.title : row.item.title}
        </p>
        <p className={clsx("truncate text-[11.5px] leading-4 text-n-500", oneLine && "hidden")}>
          {isBlock ? (
            <>
              {course && <span className="font-medium" style={{ color: colour }}>{course.shortName}</span>}
              {course && " · "}
              <span className="text-n-400">Planned · {fmtLength(row.end - row.start)}</span>
            </>
          ) : hidden ? (
            <span className="text-n-400">Left off this plan · Backspace to put back</span>
          ) : asleep ? null : (
            <>
              {row.startsBefore && <span className="text-n-400">Continues from {WEEKDAY[(new Date(row.item.start).getDay() + 6) % 7]} · </span>}
              {fixedMeta(row.item)}
            </>
          )}
        </p>
      </div>

      <span className="flex shrink-0 items-center gap-1 pt-0.5">
        {isBlock && <SyncDot state={row.block.state} />}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={hidden ? "Put back" : isBlock ? `Remove ${row.block.title}` : `Leave ${row.item.title} off the plan`}
          title={hidden ? "Put back" : isBlock ? "Remove" : "Leave off this plan (the event itself is untouched)"}
          className={clsx(
            "rounded p-1 text-n-300 transition-opacity duration-[120ms] hover:bg-n-100 hover:text-n-600 focus-visible:opacity-100",
            selected ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
          )}
        >
          {hidden ? <RestoreIcon /> : <CrossIcon />}
        </button>
      </span>
    </div>
  );
}

/**
 * The real times, not the day's slice of them: a shift from 16:00 to 00:30
 * reads "16:00–00:30 +1" on its first day and "until 00:30" the next.
 */
function TimeRange({ row }: { row: Row<PlanBlockView> }) {
  const [main, next] = timeLabel(row).split(" +");
  return <>{main}{next && <sup className="ml-0.5 text-[9px] text-n-400">+{next}</sup>}</>;
}

function fixedMeta(item: CalendarItem) {
  const parts: React.ReactNode[] = [];
  if (item.courseShort) parts.push(<span key="c" className="font-medium" style={{ color: cssColour(item.colour) }}>{item.courseShort}</span>);
  const kind =
    item.source === "class" ? (item.kind ? TASK_KIND_LABEL[item.kind] : "Class")
      : item.source === "meeting" ? "Meeting"
        : item.source === "event" ? "Event"
          : item.source === "google" ? `Google${item.notes ? ` · ${item.notes}` : ""}`
            : "";
  if (kind) parts.push(<span key="k" className="text-n-400">{kind}</span>);
  if (item.location) parts.push(<span key="l" className="text-n-400">{item.location}</span>);
  return parts.map((p, i) => <Fragment key={i}>{i > 0 && <span className="text-n-300"> · </span>}{p}</Fragment>);
}

function SyncDot({ state }: { state: PlanBlockView["state"] }) {
  if (state === "synced") {
    return (
      <span title="On Google Calendar" className="text-n-300">
        <svg width="11" height="11" viewBox="0 0 10 10" fill="none" aria-label="On Google Calendar"><path d="M2 5.2 4 7.2 8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    );
  }
  return (
    <span
      title={state === "new" ? "Not on Google Calendar yet" : "Changed since the last sync"}
      aria-label={state === "new" ? "Not synced" : "Changed since sync"}
      className={clsx("mx-1 h-[6px] w-[6px] rounded-full", state === "new" ? "bg-rust-400" : "border border-rust-400")}
    />
  );
}

/* ── Sidebar ───────────────────────────────────────────────────────────── */

function Sidebar({
  days, courses, mod, sleep, onSleep,
}: {
  days: PlanDay<PlanBlockView>[];
  courses: Map<string, ComposerCourse>;
  mod: string;
  sleep: Sleep;
  onSleep: (s: Sleep) => void;
}) {
  const byCourse = new Map<string | null, number>();
  let total = 0;
  for (const d of days) for (const r of d.rows) {
    if (r.type !== "block") continue;
    const m = r.end - r.start;
    total += m;
    byCourse.set(r.block.courseId, (byCourse.get(r.block.courseId) ?? 0) + m);
  }
  const rows = [...byCourse.entries()].sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 space-y-4">
        <div className="card p-4">
          <p className="eyebrow">Planned</p>
          <p className="font-num mt-1 text-[28px] font-semibold leading-8 text-n-900">{total ? fmtLength(total) : "-"}</p>
          {rows.length > 0 ? (
            <div className="mt-3 space-y-2">
              {rows.map(([id, m]) => {
                const c = id ? courses.get(id) : undefined;
                const colour = c ? cssColour(c.colour) : "var(--color-n-400)";
                return (
                  <div key={id ?? "none"}>
                    <div className="flex items-baseline justify-between text-[11.5px]">
                      <span className="truncate font-medium text-n-700">{c?.shortName ?? "Other"}</span>
                      <span className="font-num text-n-500">{fmtLength(m)}</span>
                    </div>
                    <div className="mt-1 h-[5px] bg-n-100">
                      <div className="h-full" style={{ width: `${(m / max) * 100}%`, background: colour }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-1 text-[12px] leading-5 text-n-500">Nothing blocked out yet. Pick a gap and press Enter.</p>
          )}
        </div>

        <SleepCard sleep={sleep} onChange={onSleep} />

        <div className="card p-4 text-[12px] text-n-600">
          <p className="eyebrow mb-2.5">Keys</p>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
            <dt><Key>↑</Key> <Key>↓</Key></dt><dd>Move</dd>
            <dt><Key>←</Key> <Key>→</Key></dt><dd>Previous / next day</dd>
            <dt><Key>⇧←</Key> <Key>⇧→</Key></dt><dd>Previous / next week</dd>
            <dt><Key>↵</Key></dt><dd>Add below</dd>
            <dt><Key>⇧↵</Key></dt><dd>Add above</dd>
            <dt><Key>E</Key></dt><dd>Edit a block</dd>
            <dt><Key>⌫</Key></dt><dd>Remove / leave off</dd>
            <dt><Key>{mod}Z</Key></dt><dd>Undo</dd>
            <dt><Key>P</Key></dt><dd>Calendar view</dd>
            <dt><Key>T</Key></dt><dd>Today</dd>
            <dt><Key>N</Key></dt><dd>Jump to now</dd>
            <dt><Key>G</Key></dt><dd>Sync to Google</dd>
          </dl>
          <p className="mt-3 border-t border-n-100 pt-2.5 text-[11.5px] leading-[17px] text-n-500">
            Type a time as <span className="font-num text-n-700">9-11</span>, <span className="font-num text-n-700">20-21</span> or a length like <span className="font-num text-n-700">2h</span>. With no time, it follows the entry above. 1-7 mean afternoon.
          </p>
        </div>
      </div>
    </aside>
  );
}

/** Sleep times for every night, or none. Backspace on one night leaves just that night off. */
function SleepCard({ sleep, onChange }: { sleep: Sleep; onChange: (s: Sleep) => void }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Sleep</p>
        <button
          role="switch"
          aria-checked={sleep.on}
          aria-label="Show sleep on the schedule"
          onClick={() => onChange({ ...sleep, on: !sleep.on })}
          className={clsx("relative h-[18px] w-[30px] rounded-full transition-colors duration-[180ms]", sleep.on ? "bg-rust-500" : "bg-n-300")}
        >
          <span className={clsx("absolute left-0 top-[2px] h-[14px] w-[14px] rounded-full bg-n-0 shadow-[0_1px_2px_rgb(26_23_20/0.3)] transition-transform duration-[180ms]", sleep.on ? "translate-x-[14px]" : "translate-x-[2px]")} />
        </button>
      </div>
      <div className={clsx("mt-2.5 flex items-center gap-1.5 transition-opacity duration-[120ms]", !sleep.on && "pointer-events-none opacity-40")}>
        <TimeField label="Bedtime" value={sleep.from} onCommit={(v) => onChange({ ...sleep, from: v })} />
        <span className="text-n-300">–</span>
        <TimeField label="Wake up" value={sleep.to} onCommit={(v) => onChange({ ...sleep, to: v })} />
        <span className="font-num ml-auto text-[11px] text-n-400">{fmtLength(((sleep.to - sleep.from + 1440) % 1440) || 1440)}</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-[17px] text-n-500">
        Counted in the free time, never sent to Google. ⌫ on one night leaves just that night off.
      </p>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

const WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function rowId(key: string) {
  return `plan-row-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function blockResult(b: PlanBlockView, day: Date): ComposerResult {
  const mins = (iso: string) => Math.round((new Date(iso).getTime() - day.getTime()) / 60000);
  return { title: b.title, courseId: b.courseId, start: mins(b.start), end: mins(b.end) };
}

function clashes(day: PlanDay<PlanBlockView>, slot: { start: number; end: number }, except: string | null) {
  return day.rows
    .filter((r) => r.type !== "empty" && r.key !== except && !(r.type === "fixed" && r.hidden))
    .filter((r) => r.type !== "empty" && r.start < slot.end && r.end > slot.start)
    .map((r) => (r.type === "block" ? r.block.title : r.type === "fixed" ? r.item.title : ""));
}

function MoonIcon({ centred }: { centred: boolean }) {
  return (
    <svg aria-hidden width="13" height="13" viewBox="0 0 14 14" fill="none" className={clsx("shrink-0 text-n-400", !centred && "mt-[3px]")}>
      <path d="M11.5 8.6A5 5 0 0 1 5.4 2.5a5 5 0 1 0 6.1 6.1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 5.5h11M5.2 5.5v7M8.8 5.5v7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function PdfIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3.5 1.5h5l3 3v8h-8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M5 8.5l2 2 2-2M7 5.5v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CrossIcon() {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}
function RestoreIcon() {
  return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M2 5a3 3 0 1 0 1-2.2M2 1.5V3h1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

