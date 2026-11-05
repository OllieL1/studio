import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { LIVIO_BASE } from "@/lib/apps";
import { fmtDateLong, fmtHM } from "@/lib/dates";
import { hasTime } from "@/lib/livio/todo";
import { taskFiles, taskFilesInclude } from "@/lib/taskFiles";
import { Eyebrow, Pill } from "@/components/ui";
import { SubtaskPanel } from "@/components/SubtaskPanel";
import { TaskWorkspace } from "@/components/TaskWorkspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Todo" };

/** One of Livio's todos, with the same Files tab as a Studio task: notes
 *  written for it and uploads kept with it. */
export default async function TodoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const tab = (await searchParams).tab === "files" ? "files" : "overview";

  const task = await db.task.findUnique({
    where: { id },
    include: { items: { orderBy: { position: "asc" } }, ...taskFilesInclude },
  });
  // A todo that has since been given a course lives in Studio now.
  if (!task || task.courseId) notFound();

  const { files, tags } = taskFiles(task);
  const done = !!task.doneAt;

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <Link href={`${LIVIO_BASE}/todo` as Route} className="text-[12px] font-medium text-n-500 hover:text-rust-600">
          ← Todo
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Eyebrow>Todo</Eyebrow>
          {done && <Pill tone="ok">Complete</Pill>}
          {task.priority > 0 && !done && <Pill tone="rust">Priority</Pill>}
        </div>
        <h1 className="font-display mt-1 text-[32px] leading-10 font-semibold tracking-tight text-n-900">{task.title}</h1>
        <p className="mt-1 text-[13px] text-n-500">
          {task.dueAt ? (
            <>
              {fmtDateLong(task.dueAt)}
              {hasTime(task.dueAt) && ` · ${fmtHM(task.dueAt)}`}
            </>
          ) : (
            "No date"
          )}
        </p>
      </div>

      <TaskWorkspace taskId={task.id} tab={tab} items={files} tags={tags} base={`${LIVIO_BASE}/todo/${task.id}`} storageKey="livio.view.todo">
        <div className="max-w-[640px]">
          <SubtaskPanel
            taskId={task.id}
            kind={task.kind}
            done={done}
            items={task.items.map((i) => ({ id: i.id, label: i.label, done: !!i.doneAt }))}
          />
        </div>
      </TaskWorkspace>
    </div>
  );
}
