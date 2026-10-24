"use client";

import { useRef, useState, useTransition } from "react";
import { importProjectTasks, type TaskImportResult } from "@/app/projectActions";
import { EXAMPLE_IMPORT } from "@/lib/taskImport";
import { TASK_KINDS } from "@/lib/types";
import { backdropProps, Portal, useModal } from "@/lib/hooks/useModal";
import { Eyebrow } from "../ui";

const EXAMPLE = JSON.stringify(EXAMPLE_IMPORT, null, 2);

/** Fields, in the order the dialog lists them. */
const FIELDS: [name: string, type: string, what: string][] = [
  ["title", "text", "Required. The only thing every task must have."],
  ["start", "YYYY-MM-DD", "Planned start. With a due date it draws the task as a bar on the schedule; without one it's a point."],
  ["due", "YYYY-MM-DD", "Deadline. Leave out for an undated task."],
  ["dueTime", "HH:MM", "Time of the deadline. Defaults to 23:59."],
  ["kind", TASK_KINDS.join(" · "), "Defaults to OTHER."],
  ["weight", "0–100", "Percentage of the final mark, where it's graded."],
  ["priority", "true / false", "Marks it high priority."],
  ["notes", "text", "Anything you want kept with the task."],
  ["subtasks", "list of text", "A checklist on the task, in order."],
  ["dependsOn", "list of titles", "Tasks to do first - ones in this file, or already on the project. Advisory, never blocking."],
  ["backlog", "true / false", "Pushed back: kept, but undated and left out of meeting prep. Its due date is ignored."],
  ["done", "true / false", "Already finished - ticked off on import."],
];

/**
 * "Import tasks" and the "?" beside it: the dialog says exactly what the file
 * should hold, so a workplan can be written (or generated) to fit.
 */
export function TaskImport() {
  const [help, setHelp] = useState(false);
  const [result, setResult] = useState<TaskImportResult | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const run = (text: string) => start(async () => setResult(await importProjectTasks(text)));

  return (
    <div>
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => file.current?.click()}
          disabled={pending}
          className="rounded-md border border-n-200 bg-n-0 px-2.5 py-1 text-[12px] font-semibold text-n-600 transition-colors hover:bg-n-50 disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import tasks JSON"}
        </button>
        <button
          type="button"
          onClick={() => setHelp(true)}
          aria-label="How to format tasks for import"
          title="How to format tasks for import"
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-n-200 bg-n-0 text-[12px] font-semibold text-n-500 transition-colors hover:bg-n-50 hover:text-n-800"
        >
          ?
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) run(await f.text());
          }}
        />
      </div>

      {result && <ImportResult result={result} onClose={() => setResult(null)} />}
      {help && <ImportHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

function ImportResult({ result, onClose }: { result: TaskImportResult; onClose: () => void }) {
  const lines = result.ok ? [...result.errors, ...result.warnings] : result.error.split("\n");
  return (
    <div className="mt-2 rounded-md border border-n-100 bg-n-25 px-3 py-2 text-[12.5px] text-n-700" role="status">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">
          {result.ok
            ? `${result.created} task${result.created === 1 ? "" : "s"} added${result.skipped.length ? ` · ${result.skipped.length} already there` : ""}${result.errors.length ? ` · ${result.errors.length} not imported` : ""}`
            : "Nothing imported"}
        </p>
        <button type="button" onClick={onClose} className="text-[11.5px] text-n-400 hover:text-n-700">Dismiss</button>
      </div>
      {lines.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-n-500">
          {lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
    </div>
  );
}

function ImportHelp({ onClose }: { onClose: () => void }) {
  useModal({ onClose });
  const [copied, setCopied] = useState(false);

  return (
    <Portal>
      <div
        className="animate-fade-in fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[var(--scrim)] px-4 py-[6vh] backdrop-blur-[2px]"
        {...backdropProps(onClose)}
        role="dialog"
        aria-modal="true"
        aria-label="Importing tasks"
      >
        <div className="animate-scale-in w-full max-w-[680px] rounded-lg border border-n-100 bg-n-0 p-6 text-left shadow-[var(--shadow-modal)]">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[22px] font-semibold tracking-tight text-n-900">Importing tasks</h2>
            <button type="button" onClick={onClose} className="text-[12px] text-n-400 hover:text-n-700">Close</button>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-n-600">
            Choose a <code className="font-mono text-[12px]">.json</code> file and every task in it is added to the project.
            It can be a list of tasks, or an object with a <code className="font-mono text-[12px]">"tasks"</code> list.
            Only <code className="font-mono text-[12px]">title</code> is required.
          </p>

          <Eyebrow className="mb-2 mt-5">Fields</Eyebrow>
          <dl className="divide-y divide-n-100 rounded-md border border-n-100">
            {FIELDS.map(([name, type, what]) => (
              <div key={name} className="grid grid-cols-[96px_1fr] gap-x-3 px-3 py-2 text-[12.5px]">
                <dt className="font-mono text-[12px] font-semibold text-n-800">{name}</dt>
                <dd className="text-n-600">
                  <span className="font-mono text-[11px] text-n-400">{type}</span>
                  <br />
                  {what}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mb-2 mt-5 flex items-center justify-between">
            <Eyebrow>Example</Eyebrow>
            <button
              type="button"
              onClick={() => { void navigator.clipboard?.writeText(EXAMPLE).then(() => setCopied(true)); }}
              className="rounded-md border border-n-200 px-2 py-0.5 text-[11.5px] font-medium text-n-600 hover:bg-n-50"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="max-h-[260px] overflow-auto rounded-md border border-n-100 bg-n-25 p-3 font-mono text-[11.5px] leading-relaxed text-n-700">{EXAMPLE}</pre>

          <ul className="mt-4 list-disc space-y-1 pl-4 text-[12px] text-n-500">
            <li>Importing the same file twice is safe: a task whose title is already on the project is skipped.</li>
            <li>A task with a problem is listed afterwards and left out; the rest still go in.</li>
            <li>Dates are real calendar dates, written year-month-day.</li>
          </ul>
        </div>
      </div>
    </Portal>
  );
}
