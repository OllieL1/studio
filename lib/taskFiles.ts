import { toNexusCard } from "./nexusData";
import type { BrowserItem } from "./noteTree";
import { extOf } from "./uploads";

/** What a task page loads to list its notes and uploads - shared by Studio's
 *  task page and Livio's todo page, so the two always show the same Files. */
export const taskFilesInclude = {
  taskNotes: {
    orderBy: { updatedAt: "desc" },
    include: { tags: { include: { tag: { select: { name: true } } } } },
  },
  attachments: { orderBy: { createdAt: "desc" } },
} as const;

type TaskWithFiles = {
  taskNotes: Parameters<typeof toNexusCard>[0][];
  attachments: { id: string; filename: string; storedName: string; size: number; createdAt: Date }[];
};

/** The Files tab's items, and the tags those notes use (so every chip finds something). */
export function taskFiles(task: TaskWithFiles): { files: BrowserItem[]; tags: string[] } {
  const files: BrowserItem[] = [
    ...task.taskNotes.map((n) => ({ ...toNexusCard(n), kind: "note" as const })),
    ...task.attachments.map((a) => ({
      kind: "file" as const, id: a.id, filename: a.filename, ext: extOf(a.storedName), size: a.size, createdAt: a.createdAt,
    })),
  ];
  const tags = [...new Set(task.taskNotes.flatMap((n) => n.tags.map((t) => t.tag.name)))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  return { files, tags };
}
