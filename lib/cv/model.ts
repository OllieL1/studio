/**
 * The CV: one master, many tailored versions.
 *
 * The master is the whole CV - everything you might ever say. A version is
 * a set of overrides on it: what's switched off (or on), what's in a different
 * order, which words differ, and the style. Anything a version hasn't
 * touched comes from the master, so fixing a typo there fixes it everywhere
 * that hadn't reworded that line.
 *
 * Every section, entry, bullet and contact line has a stable id; overrides
 * point at ids. Pure throughout - the editor, the server, the importer and
 * tests all share it.
 */

export type Bullet = { id: string; t: string; on?: boolean };

export type Contact = { id: string; label: string; text: string; stack?: boolean; on?: boolean };

export type Stat = { id: string; value: string; label: string; on?: boolean };
export type Entry = { id: string; title: string; org?: string; date: string; tags?: string; bullets: Bullet[]; on?: boolean };
export type SkillRow = { id: string; label: string; text: string; on?: boolean };
export type ListItem = { id: string; title: string; text: string; on?: boolean };

export type Section =
  | { id: string; type: "text"; title: string; text: string; on?: boolean; items?: never[] }
  | { id: string; type: "stats"; title: string; items: Stat[]; on?: boolean }
  | { id: string; type: "entries"; title: string; items: Entry[]; on?: boolean }
  | { id: string; type: "skills"; title: string; items: SkillRow[]; on?: boolean }
  | { id: string; type: "list"; title: string; items: ListItem[]; cols?: number; on?: boolean };

export type CvDoc = {
  name: string;
  headline: string;
  accent: string;
  fit: boolean;
  scale: number;
  contact: Contact[];
  sections: Section[];
};

export type Style = Partial<Pick<CvDoc, "accent" | "fit" | "scale">>;

export type Overrides = {
  /** id → shown or not, where it differs from the master. */
  on: Record<string, boolean>;
  /** "id:field" → text, where it differs from the master. */
  text: Record<string, string>;
  /** container → its children's ids in this version's order. */
  order: Record<string, string[]>;
  style: Style;
  /** Section column count, where it differs. */
  cols?: Record<string, number>;
};

export const NO_OVERRIDES: Overrides = { on: {}, text: {}, order: {}, style: {} };

export const on = (x: { on?: boolean }) => x.on !== false;

/* ── Walking the tree ───────────────────────────────────────────────────── */

type Node = { id: string; on?: boolean; [k: string]: unknown };

/** Every list in the CV, keyed the way overrides name it: "contact",
 *  "sections", a section's id for its items, an entry's id for its bullets. */
export function containers(doc: CvDoc): Map<string, Node[]> {
  const out = new Map<string, Node[]>();
  out.set("contact", doc.contact as Node[]);
  out.set("sections", doc.sections as Node[]);
  for (const s of doc.sections) {
    if (s.type === "text") continue;
    out.set(s.id, s.items as Node[]);
    if (s.type === "entries") for (const e of s.items) out.set(e.id, e.bullets as Node[]);
  }
  return out;
}

export function findNode(doc: CvDoc, id: string): { node: Node; container: string } | null {
  for (const [key, list] of containers(doc)) {
    const node = list.find((n) => n.id === id);
    if (node) return { node, container: key };
  }
  return null;
}

/** The top-level fields that aren't in a list. */
const ROOT = "cv";

function textOf(doc: CvDoc, id: string, field: string): string | undefined {
  if (id === ROOT) return (doc as unknown as Record<string, unknown>)[field] as string | undefined;
  const v = findNode(doc, id)?.node[field];
  return typeof v === "string" ? v : undefined;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/* ── Master + overrides → the CV as shown ───────────────────────────────── */

function ordered(list: Node[], order: string[] | undefined): Node[] {
  if (!order) return list;
  const byId = new Map(list.map((n) => [n.id, n]));
  const placed = order.map((id) => byId.get(id)).filter((n): n is Node => !!n);
  const rest = list.filter((n) => !order.includes(n.id));
  return [...placed, ...rest];
}

/**
 * The version as it reads: the master with this version's changes laid on top.
 * Anything not mentioned in the overrides is the master's. Items the
 * overrides know about but the master has since deleted are simply gone.
 */
export function resolveCv(master: CvDoc, o: Overrides = NO_OVERRIDES): CvDoc {
  const doc = clone(master);
  Object.assign(doc, o.style);

  const apply = (list: Node[], key: string): Node[] =>
    ordered(list, o.order[key]).map((n) => {
      if (n.id in o.on) n.on = o.on[n.id];
      for (const [k, v] of Object.entries(o.text)) {
        const [id, field] = k.split(":");
        if (id === n.id) n[field] = v;
      }
      return n;
    });

  doc.contact = apply(doc.contact as Node[], "contact") as Contact[];
  doc.sections = apply(doc.sections as Node[], "sections") as Section[];
  for (const s of doc.sections) {
    if (o.cols && s.id in o.cols && s.type === "list") s.cols = o.cols[s.id];
    if (s.type === "text") continue;
    (s as { items: Node[] }).items = apply(s.items as Node[], s.id);
    if (s.type === "entries") for (const e of s.items) e.bullets = apply(e.bullets as Node[], e.id) as Bullet[];
  }
  for (const [k, v] of Object.entries(o.text)) {
    const [id, field] = k.split(":");
    if (id === ROOT) (doc as unknown as Record<string, unknown>)[field] = v;
  }
  return doc;
}

/* ── Edits ──────────────────────────────────────────────────────────────── */

/**
 * What's being edited: the master on its own (`overrides` null), or a version.
 * Every edit returns the next state; a version's edits land in its overrides
 * and are dropped again whenever they come back round to the master's value.
 */
export type State = { master: CvDoc; overrides: Overrides | null };

export function editText(s: State, id: string, field: string, value: string): State {
  if (!s.overrides) {
    const master = clone(s.master);
    if (id === ROOT) (master as unknown as Record<string, unknown>)[field] = value;
    else {
      const hit = findNode(master, id);
      if (!hit) return s;
      hit.node[field] = value;
    }
    return { ...s, master };
  }
  const o = clone(s.overrides);
  const key = `${id}:${field}`;
  if (textOf(s.master, id, field) === value) delete o.text[key];
  else o.text[key] = value;
  return { ...s, overrides: o };
}

export function setOn(s: State, id: string, value: boolean): State {
  if (!s.overrides) {
    const master = clone(s.master);
    const hit = findNode(master, id);
    if (!hit) return s;
    if (value) delete hit.node.on;
    else hit.node.on = false;
    return { ...s, master };
  }
  const o = clone(s.overrides);
  const base = findNode(s.master, id);
  if (base && on(base.node) === value) delete o.on[id];
  else o.on[id] = value;
  return { ...s, overrides: o };
}

/** One step up or down within its list. */
export function move(s: State, id: string, delta: -1 | 1): State {
  const shown = resolveCv(s.master, s.overrides ?? NO_OVERRIDES);
  const hit = findNode(shown, id);
  if (!hit) return s;
  const ids = containers(shown).get(hit.container)!.map((n) => n.id);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (j < 0 || j >= ids.length) return s;
  [ids[i], ids[j]] = [ids[j], ids[i]];

  if (!s.overrides) {
    const master = clone(s.master);
    const list = containers(master).get(hit.container)!;
    list.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    return { ...s, master };
  }
  const o = clone(s.overrides);
  const masterIds = containers(s.master).get(hit.container)!.map((n) => n.id);
  if (ids.join() === masterIds.join()) delete o.order[hit.container];
  else o.order[hit.container] = ids;
  return { ...s, overrides: o };
}

/**
 * Something new in a list. It always lives in the master - but made inside a
 * version, it's switched off there and on only here, so the master and the
 * other versions don't suddenly grow a line written for one application.
 */
export function addNode(s: State, container: string, node: Node): State {
  const master = clone(s.master);
  const list = containers(master).get(container);
  if (!list) return s;
  const fresh = clone(node);
  if (s.overrides) fresh.on = false;
  list.push(fresh);
  if (!s.overrides) return { ...s, master };
  const o = clone(s.overrides);
  o.on[fresh.id] = true;
  return { master, overrides: o };
}

/** Gone from the master, and so from every version. In a version, "remove"
 *  only ever hides - deleting is the master's call. */
export function removeNode(s: State, id: string): State {
  if (s.overrides) return setOn(s, id, false);
  const master = clone(s.master);
  for (const list of containers(master).values()) {
    const i = list.findIndex((n) => n.id === id);
    if (i >= 0) list.splice(i, 1);
  }
  return { ...s, master };
}

export function setStyle(s: State, style: Style): State {
  if (!s.overrides) return { ...s, master: { ...clone(s.master), ...style } };
  const o = clone(s.overrides);
  for (const [k, v] of Object.entries(style) as [keyof Style, never][]) {
    if (s.master[k] === v) delete o.style[k];
    else o.style[k] = v;
  }
  return { ...s, overrides: o };
}

export function setCols(s: State, sectionId: string, cols: number): State {
  if (!s.overrides) {
    const master = clone(s.master);
    const sec = master.sections.find((x) => x.id === sectionId);
    if (sec?.type === "list") sec.cols = cols;
    return { ...s, master };
  }
  const o = clone(s.overrides);
  const sec = s.master.sections.find((x) => x.id === sectionId);
  o.cols ??= {};
  if (sec?.type === "list" && (sec.cols ?? 1) === cols) delete o.cols[sectionId];
  else o.cols[sectionId] = cols;
  return { ...s, overrides: o };
}

/** Whether a version says something different from the master here - the
 *  editor marks it and offers to put the master's back. */
export function isOverridden(o: Overrides | null, id: string, field?: string): boolean {
  if (!o) return false;
  return field ? `${id}:${field}` in o.text : id in o.on;
}

export function inherit(s: State, id: string, field?: string): State {
  if (!s.overrides) return s;
  const o = clone(s.overrides);
  if (field) delete o.text[`${id}:${field}`];
  else delete o.on[id];
  return { ...s, overrides: o };
}

export function countOverrides(o: Overrides): number {
  return Object.keys(o.on).length + Object.keys(o.text).length + Object.keys(o.order).length
    + Object.keys(o.style).length + Object.keys(o.cols ?? {}).length;
}

/* ── Ids ────────────────────────────────────────────────────────────────── */

export const newId = () => Math.random().toString(36).slice(2, 10);

type Loose = Record<string, unknown> & { items?: Loose[]; bullets?: Loose[] };

/** The old builder's CV, which has no ids, given them - deeply. */
export function withIds(raw: unknown, id: () => string = newId): CvDoc {
  const doc = clone(raw) as Loose & { contact: Loose[]; sections: Loose[] };
  const give = (n: Loose) => {
    if (typeof n.id !== "string") n.id = id();
    n.items?.forEach(give);
    n.bullets?.forEach(give);
  };
  doc.contact.forEach(give);
  doc.sections.forEach(give);
  return doc as unknown as CvDoc;
}

/* ── Importing an old version ───────────────────────────────────────────── */

const norm = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase().replace(/\s+/g, " ") : "");

/** What makes two items "the same thing" when one has been edited. */
const identity = (n: Loose, kind: string): string =>
  kind === "bullets" ? norm(n.t)
  : kind === "contact" ? norm(n.label)
  : kind === "sections" ? `${n.type}|${norm(n.title)}`
  : kind === "stats" ? norm(n.label)
  : kind === "entries" ? `${norm(n.title)}|${norm(n.org)}`
  : kind === "skills" ? norm(n.label)
  : norm(n.title);

const TEXT_FIELDS: Record<string, string[]> = {
  contact: ["label", "text"],
  sections: ["title", "text"],
  stats: ["value", "label"],
  entries: ["title", "org", "date", "tags"],
  skills: ["label", "text"],
  list: ["title", "text"],
  bullets: ["t"],
};

/**
 * An exported version from the old builder - a whole CV, no ids - turned into
 * overrides on the master. Each item is matched to the master's by what it is
 * (a role by title and company, a bullet by its words, falling back to its
 * place); a match records only what differs, and anything the master doesn't
 * have joins it, switched on just for this version.
 */
export function importVersion(master: CvDoc, imported: unknown, id: () => string = newId): State {
  let state: State = { master: clone(master), overrides: clone(NO_OVERRIDES) };
  const old = imported as Loose & { contact?: Loose[]; sections?: Loose[] };

  for (const field of ["name", "headline"]) {
    if (typeof old[field] === "string") state = editText(state, ROOT, field, old[field] as string);
  }
  const style: Style = {};
  if (typeof old.accent === "string") style.accent = old.accent;
  if (typeof old.fit === "boolean") style.fit = old.fit;
  if (typeof old.scale === "number") style.scale = old.scale;
  state = setStyle(state, style);

  const merge = (container: string, kind: string, incoming: Loose[] | undefined, child?: (m: Node, n: Loose) => void) => {
    if (!incoming) return;
    const mine = containers(state.master).get(container) ?? [];
    const taken = new Set<string>();
    const matches: Node[] = [];
    incoming.forEach((n, i) => {
      let m = mine.find((x) => !taken.has(x.id) && identity(x as Loose, kind) === identity(n, kind));
      if (!m && kind !== "bullets") {
        // Reworded rather than new: same place, same kind.
        const at = mine[i];
        if (at && !taken.has(at.id) && (kind !== "sections" || at.type === n.type)) m = at;
      }
      if (!m) {
        const fresh = withIdsNode(n, id, kind === "sections" ? (n.type as string) : kind);
        state = addNode(state, container, fresh as Node);
        m = containers(state.master).get(container)!.find((x) => x.id === fresh.id)!;
        if (n.on === false) state = setOn(state, m.id, false);
        taken.add(m.id);
        matches.push(m);
        return;
      }
      taken.add(m.id);
      matches.push(m);
      state = setOn(state, m.id, n.on !== false);
      const fields = TEXT_FIELDS[kind === "sections" ? "sections" : kind] ?? [];
      for (const f of fields) {
        if (typeof n[f] === "string" && n[f] !== m[f]) state = editText(state, m.id, f, n[f] as string);
      }
      if (kind === "list" || (kind === "sections" && n.type === "list")) {
        if (typeof n.cols === "number") state = setCols(state, m.id, n.cols);
      }
      child?.(m, n);
    });
    // The master's things this version never had.
    for (const m of containers(state.master).get(container) ?? []) {
      if (!taken.has(m.id)) state = setOn(state, m.id, false);
    }
    // And this version's order.
    const ids = [...matches.map((m) => m.id), ...(containers(state.master).get(container) ?? []).map((m) => m.id).filter((x) => !taken.has(x))];
    const masterIds = (containers(state.master).get(container) ?? []).map((m) => m.id);
    if (ids.join() !== masterIds.join()) state.overrides!.order[container] = ids;
  };

  merge("contact", "contact", old.contact);
  merge("sections", "sections", old.sections, (m, n) => {
    if (n.type === "text") return;
    merge(m.id, n.type as string, n.items, (e, en) => {
      if (n.type === "entries") merge(e.id, "bullets", en.bullets);
    });
  });
  return state;
}

function withIdsNode(n: Loose, id: () => string, _kind: string): Loose {
  const copy = clone(n);
  const give = (x: Loose) => {
    x.id = id();
    x.items?.forEach(give);
    x.bullets?.forEach(give);
  };
  give(copy);
  return copy;
}

/** What a CV actually says - hidden things gone, ids gone. For comparing. */
export function visible(doc: CvDoc): unknown {
  const strip = (n: Loose): Loose => {
    const { id: _id, on: _on, ...rest } = n;
    void _id; void _on;
    if (rest.items) rest.items = (rest.items as Loose[]).filter((x) => x.on !== false).map(strip);
    if (rest.bullets) rest.bullets = (rest.bullets as Loose[]).filter((x) => x.on !== false).map(strip);
    return rest;
  };
  return {
    name: doc.name,
    headline: doc.headline,
    accent: doc.accent,
    fit: doc.fit,
    scale: doc.scale,
    contact: (doc.contact as unknown as Loose[]).filter((x) => x.on !== false).map(strip),
    sections: (doc.sections as unknown as Loose[]).filter((x) => x.on !== false).map(strip),
  };
}

/** For the Download JSON button: the version as the old builder wrote it. */
export function toExport(name: string, doc: CvDoc) {
  return { name, cv: doc };
}
