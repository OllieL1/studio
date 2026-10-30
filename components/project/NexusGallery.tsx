"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { createNote } from "@/app/nexusActions";
import type { NoteItem } from "@/lib/noteTree";
import { NotesBrowser, useStoredView } from "./NotesBrowser";

export type NexusCard = Omit<NoteItem, "kind">;

/**
 * Nexus: the project's notebook, as a gallery or a file tree.
 *
 * No folders to keep tidy - pinning and tags do the organising, and in the
 * tree the tags are the folders. Filtering happens in the browser rather than
 * on the server because the whole set is small and it keeps typing instant.
 */
export function NexusGallery({ notes, tags }: { notes: NexusCard[]; tags: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useStoredView("studio.view.nexus", "gallery");
  const items = useMemo(() => notes.map((n) => ({ ...n, kind: "note" as const })), [notes]);

  const add = () =>
    startTransition(async () => {
      const res = await createNote();
      if (res.ok) router.push(`/project/nexus/${res.id}` as Route);
    });

  return (
    <NotesBrowser
      items={items}
      tags={tags}
      noteHref={(id) => `/project/nexus/${id}`}
      view={view}
      onViewChange={setView}
      storageKey="studio.view.nexus"
      onNew={add}
      creating={pending}
      empty={{
        title: "Nexus is empty.",
        body: "Make a note for anything that isn't a paper or a task - links, reading plans, half-formed ideas. Mention papers, tags and tasks with @ to tie them together.",
      }}
    />
  );
}
