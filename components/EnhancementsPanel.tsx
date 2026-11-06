"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  answerEnhancement, deleteEnhancement, editEnhancement, moveEnhancement, setEnhancementStatus,
  type EnhancementRow,
} from "@/app/enhancementActions";
import { OPEN_ENHANCEMENT_EVENT } from "@/components/EnhancementHotkey";
import { Card, Eyebrow, Pill } from "@/components/ui";
import { clsx } from "@/lib/clsx";
import { KIND_LABEL, KIND_TONE, KINDS, type EnhancementKind } from "@/lib/enhancements";

const fmt = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Settings → Enhancements: the queue Claude Code works through
 * (`npm run queue`, or /enhancements in Claude Code).
 */
export function EnhancementsPanel({ rows }: { rows: EnhancementRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState<EnhancementKind | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const queued = rows.filter((r) => r.status === "queued");
  const asked = rows.filter((r) => r.status === "question");
  const closed = rows.filter((r) => r.status === "done" || r.status === "wontfix");
  const visible = filter ? queued.filter((r) => r.kind === filter) : queued;

  return (
    <Card className="p-5" id="enhancements">
      <div className="mb-3 flex items-center gap-3">
        <Eyebrow>Enhancements</Eyebrow>
        <span className="text-[12px] text-n-400">
          {queued.length} queued{asked.length ? ` · ${asked.length} need an answer` : ""}
        </span>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_ENHANCEMENT_EVENT))}
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-n-200 bg-n-0 px-2.5 py-1 text-[12.5px] font-semibold text-n-700 hover:bg-n-50"
        >
          New
          <kbd className="font-num text-[10.5px] font-medium text-n-400">⌥Q</kbd>
        </button>
      </div>

      <p className="mb-4 text-[12.5px] leading-5 text-n-500">
        Bugs, features and tweaks, noted as they come up - press <strong className="text-n-700">⌥Q</strong> (Alt-Q)
        on any page of Studio or Livio. Claude Code works through them top-down with{" "}
        <code className="rounded bg-n-50 px-1 py-0.5 font-num text-[11px]">/enhancements</code>; what it did shows
        under Done after the next deploy to the stick.
      </p>

      {asked.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-warn-ink">Claude needs an answer</p>
          {asked.map((r) => (
            <Question key={r.id} row={r} busy={pending} onAnswer={(a) => run(() => answerEnhancement(r.id, a))} />
          ))}
        </div>
      )}

      {queued.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5">
          {[null, ...KINDS].map((k) => (
            <button
              key={k ?? "all"}
              type="button"
              onClick={() => setFilter(k)}
              className={clsx(
                "rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold",
                filter === k ? "border-n-300 bg-n-50 text-n-800" : "border-transparent text-n-500 hover:bg-n-50",
              )}
            >
              {k ? `${KIND_LABEL[k]} ${queued.filter((r) => r.kind === k).length}` : "All"}
            </button>
          ))}
        </div>
      )}

      {queued.length === 0 ? (
        <p className="rounded-md border border-dashed border-n-200 px-4 py-6 text-center text-[13px] text-n-500">
          Nothing queued. Press ⌥Q when something bugs you.
        </p>
      ) : (
        <ol className="divide-y divide-n-100 rounded-md border border-n-100">
          {visible.map((r) => (
            <Item
              key={r.id}
              row={r}
              busy={pending}
              first={queued[0]?.id === r.id}
              last={queued[queued.length - 1]?.id === r.id}
              canMove={!filter}
              run={run}
            />
          ))}
        </ol>
      )}

      {closed.length > 0 && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="text-[12px] font-semibold text-n-500 hover:text-n-800"
            aria-expanded={showClosed}
          >
            {showClosed ? "▾" : "▸"} Done ({closed.length})
          </button>
          {showClosed && (
            <ul className="mt-2 space-y-2">
              {closed.map((r) => (
                <li key={r.id} className="rounded-md border border-n-100 px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-num text-[11.5px] text-n-400">#{r.number}</span>
                    <Pill tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</Pill>
                    <span className={clsx("text-[13px] font-medium", r.status === "wontfix" ? "text-n-400 line-through" : "text-n-800")}>
                      {r.title}
                    </span>
                    <span className="ml-auto flex items-center gap-2 text-[11px] text-n-400">
                      {r.commit && <span className="font-num">{r.commit}</span>}
                      {r.resolvedAt && fmt(r.resolvedAt)}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => setEnhancementStatus(r.id, "queued"))}
                        className="rounded px-1.5 py-0.5 font-semibold text-n-500 hover:bg-n-50 hover:text-n-800"
                        title="It isn't fixed after all - back to the bottom of the queue"
                      >
                        Reopen
                      </button>
                    </span>
                  </div>
                  {r.resolution && (
                    <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-5 text-n-600">{r.resolution}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function Item({
  row, busy, first, last, canMove, run,
}: {
  row: EnhancementRow;
  busy: boolean;
  first: boolean;
  last: boolean;
  canMove: boolean;
  run: (fn: () => Promise<unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState(row.body);
  const [kind, setKind] = useState(row.kind);

  const save = () => {
    run(() => editEnhancement(row.id, { title, body, kind }));
    setEditing(false);
  };

  return (
    <li className="group px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className="w-7 shrink-0 font-num text-[11.5px] text-n-400">#{row.number}</span>
        <Pill tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind]}</Pill>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="min-w-0 flex-1 truncate text-left text-[13.5px] font-medium text-n-800"
          title={row.body || row.title}
        >
          {row.title}
          {row.body && <span className="ml-1.5 text-n-400">…</span>}
        </button>
        {row.path && (
          <span className="hidden max-w-[180px] truncate font-num text-[11px] text-n-400 sm:inline" title={`${row.app} ${row.path}`}>
            {row.app === "livio" ? "livio " : ""}{row.path}
          </span>
        )}
        <span className="text-[11px] text-n-400">{fmt(row.createdAt)}</span>
        {canMove && (
          <span className="flex">
            <IconButton label="Move up" disabled={busy || first} onClick={() => run(() => moveEnhancement(row.id, -1))}>↑</IconButton>
            <IconButton label="Move down" disabled={busy || last} onClick={() => run(() => moveEnhancement(row.id, 1))}>↓</IconButton>
          </span>
        )}
      </div>

      {editing && (
        <div className="mt-2.5 space-y-2 pl-9">
          <div className="flex gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={clsx(
                  "rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold",
                  kind === k ? "border-n-300 bg-n-50 text-n-800" : "border-transparent text-n-500 hover:bg-n-50",
                )}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-n-200 bg-n-0 px-2.5 py-1.5 text-[13.5px] text-n-900 outline-none focus:border-n-400"
            aria-label="Title"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Detail - steps to reproduce, what you expected, ideas…"
            className="w-full resize-y rounded-md border border-n-200 bg-n-0 px-2.5 py-1.5 text-[13px] leading-5 text-n-800 outline-none focus:border-n-400"
            aria-label="Detail"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !title.trim()}
              onClick={save}
              className="rounded-md bg-rust-500 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-50"
            >
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-[12.5px] text-n-500 hover:text-n-800">
              Cancel
            </button>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setEnhancementStatus(row.id, "wontfix"))}
                className="rounded px-2 py-1 text-[12px] font-semibold text-n-500 hover:bg-n-50 hover:text-n-800"
              >
                Drop
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (confirm(`Delete #${row.number}?`)) run(() => deleteEnhancement(row.id)); }}
                className="rounded px-2 py-1 text-[12px] font-semibold text-danger-ink hover:bg-danger-soft"
              >
                Delete
              </button>
            </span>
          </div>
        </div>
      )}
    </li>
  );
}

function Question({ row, busy, onAnswer }: { row: EnhancementRow; busy: boolean; onAnswer: (answer: string) => void }) {
  const [answer, setAnswer] = useState("");
  return (
    <div className="rounded-md border border-[#e6d5a6] bg-warn-soft/50 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="font-num text-[11.5px] text-n-400">#{row.number}</span>
        <Pill tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind]}</Pill>
        <span className="text-[13.5px] font-medium text-n-800">{row.title}</span>
      </div>
      {row.resolution && <p className="mt-2 whitespace-pre-wrap text-[13px] leading-5 text-n-700">{row.resolution}</p>}
      <div className="mt-2.5 flex items-end gap-2">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={2}
          placeholder="Your answer - it's added to the item, which goes back to the top of the queue"
          className="flex-1 resize-y rounded-md border border-n-200 bg-n-0 px-2.5 py-1.5 text-[13px] leading-5 text-n-800 outline-none focus:border-n-400"
        />
        <button
          type="button"
          disabled={busy || !answer.trim()}
          onClick={() => onAnswer(answer)}
          className="rounded-md bg-rust-500 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-50"
        >
          Answer
        </button>
      </div>
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-6 w-6 rounded text-[12px] text-n-400 hover:bg-n-50 hover:text-n-800 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
