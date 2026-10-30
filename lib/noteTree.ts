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
  updatedAt: Date;
  tags: string[];
  excerpt: string;
  words: number;
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
  Number(b.pinned) - Number(a.pinned) || +b.updatedAt - +a.updatedAt;

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

/** The search box and tag chips. A tag filter leaves files out - they have none. */
export function filterItems(items: BrowserItem[], query: string, tag: string | null): BrowserItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (tag && (item.kind === "file" || !item.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))) return false;
    if (!q) return true;
    const hay = item.kind === "file" ? item.filename : `${item.title} ${item.excerpt} ${item.tags.join(" ")}`;
    return hay.toLowerCase().includes(q);
  });
}

export type TreeRow =
  | { type: "folder"; key: string; tag: string; count: number; open: boolean }
  | { type: "item"; key: string; item: BrowserItem; depth: 0 | 1 };

/** The tree as the rows on screen, top to bottom - what ↑↓ walk through.
 *  A note in two folders gets a row in each, so keys include the folder. */
export function visibleRows(tree: Tree, collapsed: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  for (const f of tree.folders) {
    const key = `#${f.tag.toLowerCase()}`;
    const open = !collapsed.has(key);
    rows.push({ type: "folder", key, tag: f.tag, count: f.items.length, open });
    if (open) for (const item of f.items) rows.push({ type: "item", key: `${key}/${item.id}`, item, depth: 1 });
  }
  for (const item of tree.root) rows.push({ type: "item", key: `/${item.kind}:${item.id}`, item, depth: 0 });
  return rows;
}
