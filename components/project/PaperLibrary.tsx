"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPaper, deletePaper, lookupPaperDetails, updatePaper } from "@/app/projectActions";
import { PAPER_STATUSES, STATUS_LABEL, shortAuthors, type PaperMeta, type PaperStatus } from "@/lib/papers";
import { clsx } from "@/lib/clsx";
import { Card, EmptyState } from "../ui";
import { MarkdownField } from "../MarkdownField";

export type LibraryPaper = {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  venue: string | null;
  url: string | null;
  doi: string | null;
  arxivId: string | null;
  kind: string;
  status: string;
  tags: string | null;
  notes: string | null;
  citeKey: string;
};

const STATUS_TONE: Record<string, string> = {
  "to-read": "bg-n-100 text-n-600",
  reading: "bg-warn-soft text-[#7a5f16]",
  read: "bg-ok-soft text-[#3f5c38]",
};

/**
 * The research library. Paste a DOI or arXiv link and the details fill in;
 * filter by status, tag or text; tick papers and export them - with their
 * notes - to PDF, or to BibTeX for the dissertation.
 */
export function PaperLibrary({ papers }: { papers: LibraryPaper[] }) {
  const [status, setStatus] = useState<string>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  const allTags = useMemo(
    () => [...new Set(papers.flatMap((p) => (p.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean)))].sort(),
    [papers],
  );

  const shown = papers.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (tag && !(p.tags ?? "").split(",").map((t) => t.trim()).includes(tag)) return false;
    const term = q.trim().toLowerCase();
    if (term && !`${p.title} ${p.authors} ${p.venue ?? ""} ${p.tags ?? ""} ${p.notes ?? ""}`.toLowerCase().includes(term)) return false;
    return true;
  });

  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShownSelected = shown.length > 0 && shown.every((p) => selected.has(p.id));
  const ids = [...selected].join(",");
  const counts = Object.fromEntries(PAPER_STATUSES.map((s) => [s, papers.filter((p) => p.status === s).length]));

  return (
    <div className="space-y-4">
      <AddPaper />

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", ...PAPER_STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={clsx(
                "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors duration-[120ms]",
                status === s ? "border-transparent bg-n-800 text-white" : "border-n-200 text-n-500 hover:bg-n-50",
              )}
            >
              {s === "all" ? "All" : STATUS_LABEL[s as PaperStatus]}
              <span className="font-num ml-1 opacity-60">{s === "all" ? papers.length : counts[s]}</span>
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, authors, notes…"
            className="ml-auto h-8 w-56 rounded-sm border border-n-200 px-2.5 text-[12.5px] outline-none focus:border-rust-400"
          />
        </div>
        {allTags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-n-100 pt-2">
            <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-400">Tags</span>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                aria-pressed={tag === t}
                className={clsx("rounded-md px-2 py-0.5 text-[11.5px] transition-colors", tag === t ? "bg-rust-100 font-semibold text-rust-700" : "text-n-500 hover:bg-n-50")}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Selection bar */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-n-500">
          <input
            type="checkbox"
            checked={allShownSelected}
            onChange={() =>
              setSelected((s) => {
                const n = new Set(s);
                for (const p of shown) { if (allShownSelected) n.delete(p.id); else n.add(p.id); }
                return n;
              })
            }
            className="h-3.5 w-3.5 accent-[var(--color-rust-500)]"
          />
          Select all shown
        </label>
        <span className="text-[12px] text-n-400">{selected.size > 0 ? `${selected.size} selected` : ""}</span>
        {selected.size > 0 && (
          <>
            <button onClick={() => setSelected(new Set())} className="text-[12px] font-medium text-n-500 hover:text-n-800">Clear</button>
            <span className="ml-auto flex items-center gap-2">
              <a
                href={`/api/project/papers/pdf?ids=${ids}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-rust-500 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-rust-600"
              >
                Export PDF
              </a>
              <a
                href={`/api/project/bibtex?ids=${ids}`}
                download="studio-references.bib"
                className="rounded-md border border-n-200 bg-n-0 px-3 py-1.5 text-[12.5px] font-semibold text-n-700 hover:bg-n-50"
              >
                Export BibTeX
              </a>
            </span>
          </>
        )}
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            title={papers.length === 0 ? "No papers yet." : "Nothing matches."}
            body={papers.length === 0 ? "Paste a paper's link above - arXiv, ACM, IEEE with a DOI, Springer - and its details fill in." : "Try another filter."}
          />
        </Card>
      ) : (
        <Card>
          {shown.map((p) => (
            <PaperRow
              key={p.id}
              paper={p}
              selected={selected.has(p.id)}
              onToggle={() => toggle(p.id)}
              expanded={open === p.id}
              onExpand={() => setOpen(open === p.id ? null : p.id)}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

function PaperRow({
  paper: p, selected, onToggle, expanded, onExpand,
}: { paper: LibraryPaper; selected: boolean; onToggle: () => void; expanded: boolean; onExpand: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tags, setTags] = useState(p.tags ?? "");

  const setStatus = (s: string) =>
    startTransition(async () => { await updatePaper(p.id, { status: s }); router.refresh(); });

  return (
    <div className="border-b border-n-100 last:border-b-0">
      <div className="flex items-start gap-3 px-3 py-2.5 hover:bg-n-25">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${p.title}`} className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--color-rust-500)]" />
        <button onClick={onExpand} className="min-w-0 flex-1 text-left">
          <p className="text-[14px] font-medium leading-5 text-n-800">{p.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-n-500" title={p.venue ?? undefined}>
            {shortAuthors(p.authors)}
            {p.year && ` · ${p.year}`}
            {p.venue && <span className="text-n-400"> · {p.venue}</span>}
          </p>
          {(p.tags || p.notes) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px]">
              {(p.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                <span key={t} className="text-rust-600">#{t}</span>
              ))}
              {p.notes && <span className="truncate text-n-400">{p.notes.replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "").replace(/[#*_`>]/g, "").replace(/\s+/g, " ").slice(0, 90)}</span>}
            </p>
          )}
        </button>
        <select
          value={p.status}
          disabled={pending}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Reading status"
          className={clsx("shrink-0 cursor-pointer rounded-full border-0 px-2 py-1 text-[11.5px] font-semibold outline-none", STATUS_TONE[p.status])}
        >
          {PAPER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {expanded && (
        <div className="animate-fade-in space-y-3 px-3 pb-4 pl-9">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="font-medium text-rust-600 hover:underline">Open paper ↗</a>}
            {p.doi && <span className="font-num text-n-400">doi:{p.doi}</span>}
            {p.arxivId && <span className="font-num text-n-400">arXiv:{p.arxivId}</span>}
            <span className="font-num text-n-400">cite: {p.citeKey}</span>
          </div>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-500">Tags</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              onBlur={() => tags !== (p.tags ?? "") && startTransition(async () => { await updatePaper(p.id, { tags }); router.refresh(); })}
              placeholder="related work, evaluation, …"
              className="h-8 w-full max-w-md rounded-sm border border-n-200 px-2.5 text-[12.5px] outline-none focus:border-rust-400"
            />
          </label>
          <div>
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-500">Notes</span>
            <MarkdownField
              initial={p.notes ?? ""}
              save={async (md) => updatePaper(p.id, { notes: md })}
              placeholder="Key ideas, method, how it relates to your project, quotes worth keeping…"
              minHeight={140}
            />
          </div>
          <button
            onClick={() => { if (confirm(`Remove "${p.title}" from your library?`)) startTransition(async () => { await deletePaper(p.id); router.refresh(); }); }}
            className="text-[12px] font-semibold text-n-400 hover:text-danger"
          >
            Remove paper
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Adding ─────────────────────────────────────────────────────────────── */

type Draft = { title: string; authors: string; year: string; venue: string; url: string; doi: string | null; arxivId: string | null; kind: PaperMeta["kind"]; status: string; tags: string; notes: string };
const EMPTY: Draft = { title: "", authors: "", year: "", venue: "", url: "", doi: null, arxivId: null, kind: "article", status: "to-read", tags: "", notes: "" };

function AddPaper() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [looking, startLookup] = useTransition();
  const [saving, startSave] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const lookup = () => {
    if (!input.trim()) return;
    setError(null);
    startLookup(async () => {
      const res = await lookupPaperDetails(input);
      if (res.ok) {
        const m = res.meta;
        setDraft({ ...EMPTY, title: m.title, authors: m.authors.join("; "), year: m.year ? String(m.year) : "", venue: m.venue ?? "", url: m.url ?? "", doi: m.doi, arxivId: m.arxivId, kind: m.kind });
      } else {
        setError(res.error);
        setDraft({ ...EMPTY, url: /^https?:\/\//.test(input.trim()) ? input.trim() : "" });
      }
    });
  };

  const save = () => {
    if (!draft) return;
    setError(null);
    startSave(async () => {
      const res = await createPaper({
        title: draft.title,
        authors: draft.authors.split(";").map((a) => a.trim()).filter(Boolean),
        year: draft.year ? Number(draft.year) : null,
        venue: draft.venue || null,
        url: draft.url || null,
        doi: draft.doi,
        arxivId: draft.arxivId,
        kind: draft.kind,
        status: draft.status,
        tags: draft.tags || null,
        notes: draft.notes || null,
      });
      if (!res.ok) { setError(res.error); return; }
      setDraft(null);
      setInput("");
      router.refresh();
    });
  };

  return (
    <Card className="overflow-visible">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span aria-hidden className="ml-1 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-rust-100 text-[12px] font-bold text-rust-600">+</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="Paste a paper link or DOI - arXiv, ACM, Springer, doi.org…"
          aria-label="Paper link"
          className="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-n-800 outline-none placeholder:text-n-400"
        />
        <button onClick={() => { setError(null); setDraft({ ...EMPTY }); }} className="shrink-0 rounded-md px-2 py-1.5 text-[12px] font-medium text-n-500 hover:bg-n-50">
          Add manually
        </button>
        <button onClick={lookup} disabled={looking || !input.trim()} className="shrink-0 rounded-md bg-rust-500 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-40">
          {looking ? "Looking up..." : "Look up"}
        </button>
      </div>

      {error && <p className="border-t border-n-100 px-4 py-2 text-[12.5px] text-warn">{error}</p>}

      {draft && (
        <div className="animate-fade-in space-y-3 border-t border-n-100 px-4 py-4">
          <Field label="Title"><input value={draft.title} onChange={(e) => set("title", e.target.value)} className={inputCls} /></Field>
          <Field label="Authors" hint="Surname, Given - separated by semicolons.">
            <input value={draft.authors} onChange={(e) => set("authors", e.target.value)} className={inputCls} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[90px_1fr_1fr]">
            <Field label="Year"><input value={draft.year} onChange={(e) => set("year", e.target.value.replace(/\D/g, "").slice(0, 4))} className={clsx(inputCls, "font-num")} /></Field>
            <Field label="Venue"><input value={draft.venue} onChange={(e) => set("venue", e.target.value)} className={inputCls} /></Field>
            <Field label="Link"><input value={draft.url} onChange={(e) => set("url", e.target.value)} className={inputCls} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <Field label="Status">
              <div className="flex gap-1">
                {PAPER_STATUSES.map((s) => (
                  <button key={s} type="button" onClick={() => set("status", s)} aria-pressed={draft.status === s}
                    className={clsx("rounded-full border px-2.5 py-1 text-[12px] font-medium", draft.status === s ? "border-transparent bg-n-800 text-white" : "border-n-200 text-n-500 hover:bg-n-50")}>
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Tags"><input value={draft.tags} onChange={(e) => set("tags", e.target.value)} placeholder="related work, evaluation" className={inputCls} /></Field>
          </div>
          <Field label="Notes">
            <textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Why it matters to your project (markdown)" className={clsx(inputCls, "h-auto resize-y py-2")} />
          </Field>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className="rounded-md px-3 py-1.5 text-[12.5px] font-semibold text-n-500 hover:bg-n-100">Cancel</button>
            <button onClick={save} disabled={saving || !draft.title.trim()} className="rounded-md bg-rust-500 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-rust-600 disabled:opacity-40">
              {saving ? "Saving..." : "Add to library"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

const inputCls = "h-9 w-full rounded-sm border border-n-200 bg-n-0 px-2.5 text-[13px] text-n-800 outline-none transition-colors focus:border-rust-400 placeholder:text-n-400";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-n-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] text-n-400">{hint}</span>}
    </label>
  );
}
