"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createNote } from "@/app/nexusActions";
import { deleteAttachment } from "@/app/actions";
import { isTypingTarget } from "@/lib/livio/keys";
import type { PageCommand, ParsedCommand } from "@/lib/livio/table";
import type { BrowserItem } from "@/lib/noteTree";
import { clsx } from "@/lib/clsx";
import { CommandBar } from "./livio/CommandBar";
import { HelpSheet, type HelpSection } from "./livio/HelpSheet";
import { Kbd } from "./livio/Kbd";
import { NotesBrowser, useStoredView } from "./project/NotesBrowser";
import { useUploader } from "./editor/Attachments";

export type TaskTab = "overview" | "files";

/** What `:u` and the Upload button take. Markdown becomes a note; the rest are kept as files. */
const ACCEPT = ".pdf,.docx,.pptx,.md,.markdown";
const isMarkdown = (f: File) => /\.(md|markdown)$/i.test(f.name);

const COMMANDS: PageCommand[] = [
  { name: "new", hint: "A new note for this task", arg: "title", aliases: ["n"] },
  { name: "upload", hint: "Upload a PDF, Word, PowerPoint or Markdown file", aliases: ["u"] },
  { name: "files", hint: "Notes and files" },
  { name: "overview", hint: "Checklist, time and dependencies" },
  { name: "tree", hint: "Show files as a tree" },
  { name: "gallery", hint: "Show files as cards" },
];

const HELP: HelpSection[] = [
  {
    title: "Commands",
    rows: [
      [[":"], "Command bar"],
      [[":n …"], "New note, optionally titled"],
      [[":u"], "Upload a file"],
      [[":files"], "Notes and files"],
      [[":overview"], "Back to the overview"],
      [[":tree", ":gallery"], "Switch the files view"],
      [["?"], "This sheet"],
    ],
  },
  {
    title: "The tree",
    rows: [
      [["↑", "↓"], "Move"],
      [["j", "k"], "…or vim keys"],
      [["←", "→"], "Fold / unfold a tag"],
      [["↵"], "Open"],
    ],
  },
];

/**
 * A task page's tabs and its `:` bar - the same bar as Livio's. Overview is
 * the server-rendered checklist passed in as children; Files holds the task's
 * notes and uploads together, as a tree by default.
 */
export function TaskWorkspace({
  taskId,
  tab,
  items,
  tags,
  children,
}: {
  taskId: string;
  tab: TaskTab;
  items: BrowserItem[];
  tags: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [command, setCommand] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [view, setView] = useStoredView("studio.view.task", "tree");
  const [creating, startCreating] = useTransition();
  const [, startTransition] = useTransition();
  const [over, setOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mdError, setMdError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { upload: uploadFiles, busy, error } = useUploader(taskId);

  const base = `/tasks/${taskId}`;
  const goTo = (next: TaskTab) => {
    if (next !== tab) router.push((next === "files" ? `${base}?tab=files` : base) as Route, { scroll: false });
  };
  const noteHref = (id: string) => `${base}/notes/${id}`;

  const newNote = (title?: string) =>
    startCreating(async () => {
      const res = await createNote({ taskId, title });
      if (res.ok) router.push(noteHref(res.id) as Route);
    });

  /** Markdown files become notes; everything else goes to the uploads folder. */
  const upload = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    goTo("files");
    setMdError(null);
    const markdown = files.filter(isMarkdown);
    const opened: string[] = [];
    if (markdown.length) {
      setImporting(true);
      for (const f of markdown) {
        const res = await createNote({ taskId, title: f.name.replace(/\.(md|markdown)$/i, ""), body: await f.text() });
        if (res.ok) opened.push(res.id);
        else setMdError(res.error);
      }
      setImporting(false);
    }
    await uploadFiles(files.filter((f) => !isMarkdown(f)));
    // One Markdown file and nothing else: straight into it, ready to edit.
    if (files.length === 1 && opened.length === 1) router.push(noteHref(opened[0]) as Route);
  };

  const run = (cmd: ParsedCommand): string | void => {
    if (cmd.kind === "help") return setHelp(true);
    if (cmd.kind !== "run") return "Type a command - :help lists them.";
    switch (cmd.name) {
      case "new": return newNote(cmd.arg || undefined);
      // Still inside the Enter key press, so the browser allows the picker.
      case "upload": return picker.current?.click();
      case "files": return goTo("files");
      case "overview": return goTo("overview");
      case "tree":
      case "gallery":
        setView(cmd.name);
        return goTo("files");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      // Another dialog (the edit modal) owns the keyboard while it's open.
      if (command !== null || help || document.querySelector('[aria-modal="true"]')) return;
      if (e.key === ":") { e.preventDefault(); setCommand(""); }
      else if (e.key === "?") { e.preventDefault(); setHelp(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [command, help]);

  const uploading = busy || importing;
  const problem = mdError ?? error;
  const tabs = [
    { key: "overview" as const, label: "Overview", count: null },
    { key: "files" as const, label: "Files", count: items.length },
  ];

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-0.5 border-b border-n-200">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={(t.key === "files" ? `${base}?tab=files` : base) as Route}
            scroll={false}
            className={clsx(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors duration-[120ms]",
              tab === t.key ? "border-rust-500 text-n-900" : "border-transparent text-n-500 hover:text-n-800",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && <span className="font-num ml-1.5 text-[11px] font-normal text-n-400">{t.count}</span>}
          </Link>
        ))}
        <button
          onClick={() => setCommand("")}
          title="Commands - :n new note, :u upload"
          className="ml-auto mb-1 flex items-center gap-1.5 self-center rounded-md px-2 py-1 text-[11.5px] font-medium text-n-500 transition-colors duration-[120ms] hover:bg-n-50 hover:text-n-700"
        >
          <Kbd>:</Kbd> commands
        </button>
      </nav>

      {(uploading || problem) && (
        <p className={clsx("animate-fade-in text-[12px]", problem ? "text-danger" : "text-n-500")}>
          {uploading ? "Uploading…" : problem}
        </p>
      )}

      {tab === "overview" ? (
        children
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void upload(e.dataTransfer.files);
          }}
          className={clsx("-m-2 rounded-lg p-2 transition-colors duration-[120ms]", over && "bg-rust-50 ring-1 ring-rust-300")}
        >
          <NotesBrowser
            items={items}
            tags={tags}
            noteHref={noteHref}
            view={view}
            onViewChange={setView}
            storageKey="studio.view.task"
            onNew={() => newNote()}
            creating={creating}
            actions={
              <button
                onClick={() => picker.current?.click()}
                disabled={uploading}
                className="flex h-8 items-center rounded-md border border-n-200 bg-n-0 px-2.5 text-[12.5px] font-semibold text-n-600 transition-colors duration-[120ms] hover:bg-n-50 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            }
            onRemoveFile={(f) => {
              if (!confirm(`Remove "${f.filename}"?`)) return;
              startTransition(async () => {
                await deleteAttachment(f.id);
                router.refresh();
              });
            }}
            empty={{
              title: "Nothing here yet.",
              body: "Press : then n for a note, or u to upload a PDF, Word, PowerPoint or Markdown file. You can also drop files here.",
            }}
          />
        </div>
      )}

      <input
        ref={picker}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />

      {command !== null && (
        <CommandBar initial={command} commands={COMMANDS} fields={[]} table={false} onRun={run} onClose={() => setCommand(null)} />
      )}
      {help && <HelpSheet sections={HELP} onClose={() => setHelp(false)} />}
    </div>
  );
}
