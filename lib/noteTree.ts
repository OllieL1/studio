/**
 * What the notes browser lists - notes and uploaded files - and how the tree
 * view arranges them. Pure, so the ordering rules are tested and the
 * component only draws.
 *
 * There are no real folders: tags are the folders. A note with two tags sits
 * in both, untagged notes sit at the root, and so does every uploaded file
 * (files have no tags).
 */

export type NoteItem = {
  kind: "note";
  id: string;
  title: string;
  pinned: boolean;
  /** Null where it isn't known - a knowledge-base doc read from git. */
  updatedAt: Date | null;
  tags: string[];
  excerpt: string;
  words: number;
  /** The file's name, shown beside the word count - a knowledge-base doc. */
  file?: string;
  /** Uncommitted edits to it - a knowledge-base doc with a draft. */
  change?: { state: "modified" | "added" | "behind"; added: number; removed: number };
};

export type FileItem = {
  kind: "file";
  id: string;
  filename: string;
  /** "pdf" | "docx" | "pptx" - what the icon and badge show. */
  ext: string;
  size: number;
  createdAt: Date;
};

export type BrowserItem = NoteItem | FileItem;

export type Tree = {
  folders: { tag: string; items: NoteItem[] }[];
  root: BrowserItem[];
};

const newestFirst = (a: NoteItem, b: NoteItem) =>
  Number(b.pinned) - Number(a.pinned) || +(b.updatedAt ?? 0) - +(a.updatedAt ?? 0);

/** Tags as folders, A → Z; pinned then most recent inside each. */
export function buildTree(items: BrowserItem[]): Tree {
  const byKey = new Map<string, { tag: string; items: NoteItem[] }>();
  const loose: NoteItem[] = [];
  const files: FileItem[] = [];

  for (const item of items) {
    if (item.kind === "file") {
      files.push(item);
      continue;
    }
    if (item.tags.length === 0) {
      loose.push(item);
      continue;
    }
    // Tags are unique case-insensitively, so "LoRA" and "lora" are one folder.
    const seen = new Set<string>();
    for (const tag of item.tags) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const folder = byKey.get(key) ?? { tag, items: [] };
      folder.items.push(item);
      byKey.set(key, folder);
    }
  }

  const folders = [...byKey.values()]
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }))
    .map((f) => ({ tag: f.tag, items: f.items.sort(newestFirst) }));

  return {
    folders,
    root: [...loose.sort(newestFirst), ...files.sort((a, b) => +b.createdAt - +a.createdAt)],
  };
}

/**
 * The search box and tag chips. A tag filter leaves files out - they have none.
 * With `nested` the "tags" are folders, and a folder takes in its subfolders:
 * `msci-project` keeps `msci-project/notes/x.md`.
 */
export function filterItems(items: BrowserItem[], query: string, tag: string | null, nested = false): BrowserItem[] {
  const q = query.trim().toLowerCase();
  const want = tag?.toLowerCase();
  const matches = (t: string) => {
    const k = t.toLowerCase();
    return k === want || (nested && k.startsWith(`${want}/`));
  };
  return items.filter((item) => {
    if (tag && (item.kind === "file" || !item.tags.some(matches))) return false;
    if (!q) return true;
    const hay = item.kind === "file" ? item.filename : `${item.title} ${item.excerpt} ${item.tags.join(" ")} ${item.file ?? ""}`;
    return hay.toLowerCase().includes(q);
  });
}

export type TreeRow =
  | { type: "folder"; key: string; tag: string; count: number; open: boolean; /** Something inside is uncommitted. */ changed: boolean }
  | { type: "item"; key: string; item: BrowserItem; depth: 0 | 1; /** The folder row's key, inside one. */ parent?: string };

/** The tree as the rows on screen, top to bottom - what ↑↓ walk through.
 *  A note in two folders gets a row in each, so keys include the folder.
 *  Folder names can hold "/" (a knowledge-base path), so an item row names
 *  its folder rather than leaving it to be cut out of the key. */
export function visibleRows(tree: Tree, collapsed: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  for (const f of tree.folders) {
    const key = `#${f.tag.toLowerCase()}`;
    const open = !collapsed.has(key);
    rows.push({ type: "folder", key, tag: f.tag, count: f.items.length, open, changed: f.items.some((i) => !!i.change) });
    if (open) for (const item of f.items) rows.push({ type: "item", key: `${key}/${item.id}`, item, depth: 1, parent: key });
  }
  for (const item of tree.root) rows.push({ type: "item", key: `/${item.kind}:${item.id}`, item, depth: 0 });
  return rows;
}
