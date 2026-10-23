"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createVersion, deleteVersion, importVersions, renameVersion, saveMaster, saveVersion, type VersionSummary,
} from "@/app/cvActions";
import { LIVIO_BASE } from "@/lib/apps";
import { clsx } from "@/lib/clsx";
import {
  addNode, countOverrides, editText, inherit, isOverridden, move, newId, NO_OVERRIDES, on, removeNode, resolveCv,
  setCols, setOn, setStyle, toExport, type CvDoc, type Overrides, type Section, type State,
} from "@/lib/cv/model";
import { download, slug } from "@/lib/livio/shareCard";
import { NO_AUTOFILL } from "@/lib/livio/keys";
import { Eyebrow } from "../../ui";
import { Kbd } from "../Kbd";
import { CvSheet } from "./CvSheet";

const BASE_U = 13.333; // px: 1em = body text = 10pt at 100%
const K = 4; // the sheet is laid out at 4x
const PAGE_PX = ((296.6 * 96) / 25.4) * K;
const SHEET_W = (210 * 96) / 25.4;
const SWATCHES = ["#c8ff2e", "#ff5a36", "#3d6bff", "#8156d2", "#ffb800", "#19e6a5", "#ff3d9a"];

type Current = { id: string; name: string; overrides: Overrides } | null;

const TEMPLATES: Record<string, () => Record<string, unknown>> = {
  stats: () => ({ id: newId(), value: "0", label: "Label" }),
  entries: () => ({ id: newId(), title: "New role", org: "Company", date: "2026", tags: "", bullets: [{ id: newId(), t: "What you did" }] }),
  skills: () => ({ id: newId(), label: "Category", text: "Skill, Skill" }),
  list: () => ({ id: newId(), title: "Title", text: "Detail" }),
};

/**
 * The CV editor: the A4 sheet you edit in place, and a panel for everything
 * the sheet can't show - versions, what's switched on, order, style.
 *
 * Editing the master changes the master. Editing a version only ever writes
 * that version's overrides (lib/cv/model.ts); anything changed there is
 * marked, with the master's wording one click away.
 */
export function CvEditor({ initialMaster, versions, current }: {
  initialMaster: CvDoc;
  versions: VersionSummary[];
  current: Current;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>({ master: initialMaster, overrides: current ? current.overrides : null });
  const doc = useMemo(() => resolveCv(state.master, state.overrides ?? NO_OVERRIDES), [state]);
  const version = current ? versions.find((v) => v.id === current.id) : null;

  /* ── Saving: debounced, and only what changed ─────────────────────── */
  const saved = useRef<State>(state);
  const [dirty, setDirty] = useState(false);
  const flush = useCallback(async () => {
    const now = stateRef.current;
    const jobs: Promise<unknown>[] = [];
    if (now.master !== saved.current.master) jobs.push(saveMaster(now.master));
    if (current && now.overrides && now.overrides !== saved.current.overrides) jobs.push(saveVersion(current.id, now.overrides));
    saved.current = now;
    await Promise.all(jobs);
    setDirty(false);
  }, [current]);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (state === saved.current) return;
    setDirty(true);
    const t = setTimeout(flush, 600);
    return () => clearTimeout(t);
  }, [state, flush]);
  // Never lose the last few keystrokes to a tab closing.
  useEffect(() => {
    const onHide = () => { if (stateRef.current !== saved.current) void flush(); };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flush]);

  const go = async (href: string) => {
    await flush();
    router.push(href as Route);
  };

  const update = (f: (s: State) => State) => setState((s) => f(s));
  const onText = useCallback((id: string, field: string, value: string) => update((s) => editText(s, id, field, value)), []);

  /* ── Fitting and scaling the sheet ─────────────────────────────────── */
  const sheet = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ ok: boolean; overMm: number; pt: number | null; pct: number }>({ ok: true, overMm: 0, pt: null, pct: 100 });
  const [s, setS] = useState(0.8);

  useLayoutEffect(() => {
    const el = sheet.current;
    const inner = el?.firstElementChild as HTMLElement | null;
    if (!el || !inner) return;
    const fits = (u: number) => {
      el.style.setProperty("--u", `${u}px`);
      return inner.offsetHeight <= PAGE_PX + 1.5 * K;
    };
    let u: number;
    if (doc.fit) {
      // The biggest size that still fits one page, capped at 10.5pt so a
      // short CV doesn't balloon.
      let lo = 8;
      let hi = BASE_U * 1.05;
      if (fits(hi)) lo = hi;
      else for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
      u = lo;
    } else u = doc.scale * BASE_U;
    const ok = fits(u);
    const sample = el.querySelector("ul.bl li, .lead");
    const pt = sample ? (parseFloat(getComputedStyle(sample).fontSize) / K) * 0.75 : null;
    setFit({ ok, overMm: Math.ceil(((inner.offsetHeight - PAGE_PX) * 25.4) / 96 / K), pt, pct: Math.round((u / BASE_U) * 100) });
  }, [doc]);

  useEffect(() => {
    // The fonts arriving changes every measurement.
    void document.fonts?.ready.then(() => setState((x) => ({ ...x })));
  }, []);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setS(Math.min(1.1, (el.clientWidth - 48) / SHEET_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The PDF's name is the page title at print time.
  useEffect(() => {
    document.title = `${doc.name} - CV${current ? ` - ${current.name}` : ""}`;
  }, [doc.name, current]);

  const print = async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    await flush();
    setTimeout(() => window.print(), 50);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <aside className="cv-chrome space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <div>
          <Eyebrow>CV</Eyebrow>
          <h1 className="font-display mt-1 text-[30px] leading-9 font-semibold tracking-tight text-n-900">
            {current ? current.name : "Master"}
          </h1>
          <p className="mt-1 text-[12.5px] leading-5 text-n-500">
            {current
              ? <>A version of your master CV. What you change here stays here{countOverrides(state.overrides ?? NO_OVERRIDES) ? <> - <b className="font-semibold text-rust-600">{countOverrides(state.overrides!)} {countOverrides(state.overrides!) === 1 ? "change" : "changes"}</b> so far</> : null}.</>
              : "Everything you might ever put on a CV. Versions start from here and pick up its fixes."}
          </p>
        </div>

        <button
          type="button"
          onClick={print}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-rust-500 px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-rust-600"
        >
          Export PDF <span className="font-num text-[11px] font-normal opacity-80">⌘P</span>
        </button>
        <div className="-mt-3 space-y-0.5 text-[12px]">
          <p className={fit.ok ? "text-ok" : "font-medium text-danger"}>
            {fit.ok ? "✓ Fits one A4 page" : `✕ Over by about ${fit.overMm}mm - hide something${doc.fit ? " (already at the smallest size)" : " or turn on auto-fit"}`}
          </p>
          {fit.pt && (
            <p className="text-n-400">
              Body text {fit.pt.toFixed(1)}pt · {fit.pct}% {fit.pt < 8.5 && <span className="text-warn">- getting small</span>}
            </p>
          )}
          <p className="text-n-400">{dirty ? "Saving…" : "Saved"} · In the print dialog: margins None, no headers and footers.</p>
        </div>

        <Versions versions={versions} current={current} version={version ?? null} go={go} state={state} doc={doc}
          onReset={() => update((x) => ({ ...x, overrides: { ...NO_OVERRIDES } }))} />

        <Panel title="Style">
          <div className="flex flex-wrap items-center gap-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Accent ${c}`}
                onClick={() => update((x) => setStyle(x, { accent: c }))}
                className={clsx("h-6 w-6 rounded-full border-2 transition-transform hover:scale-110", doc.accent === c ? "border-n-800" : "border-transparent")}
                style={{ background: c }}
              />
            ))}
            <input type="color" value={doc.accent} onChange={(e) => update((x) => setStyle(x, { accent: e.target.value }))} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0" aria-label="Any colour" />
            <Mark show={!!state.overrides && "accent" in state.overrides.style} onReset={() => update((x) => setStyle(x, { accent: x.master.accent }))} />
          </div>
          <label className="mt-3 flex items-center gap-2 text-[12.5px] text-n-700">
            <input type="checkbox" checked={doc.fit} onChange={(e) => update((x) => setStyle(x, { fit: e.target.checked }))} className="accent-[var(--color-rust-500)]" />
            Auto-fit to one page
          </label>
          {!doc.fit && (
            <input type="range" min={0.6} max={1.3} step={0.01} value={doc.scale}
              onChange={(e) => update((x) => setStyle(x, { scale: Number(e.target.value) }))}
              className="mt-2 w-full accent-[var(--color-rust-500)]" aria-label="Text size" />
          )}
        </Panel>

        <Panel title="Content" hint="Click any text on the page to edit it. Here: what's in, in what order.">
          <Group title="Name & contact">
            <Field label="Name" value={doc.name} overridden={isOverridden(state.overrides, "cv", "name")}
              onChange={(v) => onText("cv", "name", v)} onReset={() => update((x) => inherit(x, "cv", "name"))} />
            <Field label="Headline" value={doc.headline} overridden={isOverridden(state.overrides, "cv", "headline")}
              onChange={(v) => onText("cv", "headline", v)} onReset={() => update((x) => inherit(x, "cv", "headline"))} />
            {doc.contact.map((k) => (
              <div key={k.id} className={clsx("flex items-start gap-2", !on(k) && "opacity-50")}>
                <Toggle on={on(k)} overridden={isOverridden(state.overrides, k.id)} onChange={(v) => update((x) => setOn(x, k.id, v))} onReset={() => update((x) => inherit(x, k.id))} />
                <Field small value={k.label} className="w-[78px] shrink-0" overridden={isOverridden(state.overrides, k.id, "label")}
                  onChange={(v) => onText(k.id, "label", v)} onReset={() => update((x) => inherit(x, k.id, "label"))} />
                <Field small value={k.text} className="min-w-0 flex-1" overridden={isOverridden(state.overrides, k.id, "text")}
                  onChange={(v) => onText(k.id, "text", v)} onReset={() => update((x) => inherit(x, k.id, "text"))} />
              </div>
            ))}
          </Group>
          {doc.sections.map((sec) => (
            <SectionGroup key={sec.id} sec={sec} state={state} update={update} onText={onText} />
          ))}
        </Panel>
      </aside>

      <div ref={stage} className="cv-stage flex justify-center overflow-hidden rounded-lg bg-n-50 px-6 py-6">
        <div className="cvs-wrap" style={{ ["--s" as string]: s.toFixed(4) }}>
          <CvSheet doc={doc} onText={onText} sheetRef={sheet} over={!fit.ok} />
        </div>
      </div>
    </div>
  );
}

/* ── Versions ───────────────────────────────────────────────────────────── */

function Versions({ versions, current, version, go, state, doc, onReset }: {
  versions: VersionSummary[];
  current: Current;
  version: VersionSummary | null;
  go: (href: string) => Promise<void>;
  state: State;
  doc: CvDoc;
  onReset: () => void;
}) {
  const [naming, setNaming] = useState<"new" | "copy" | "rename" | null>(null);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "reset" | null>(null);
  // Delete and reset ask twice: the first click arms them for a few seconds.
  const arm = (what: "delete" | "reset") => {
    setConfirm(what);
    setTimeout(() => setConfirm((c) => (c === what ? null : c)), 3000);
  };
  const [message, setMessage] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const base = `${LIVIO_BASE}/cv`;

  const submit = async () => {
    const n = name.trim();
    if (!n) return setNaming(null);
    if (naming === "rename" && current) {
      await renameVersion(current.id, n);
      setNaming(null);
      return go(`${base}?v=${current.id}`);
    }
    const id = await createVersion(n, naming === "copy" ? current?.id : undefined);
    setNaming(null);
    await go(`${base}?v=${id}`);
  };

  const changed = current && countOverrides(state.overrides ?? NO_OVERRIDES) > 0;
  const actions = (
    <>
      <IconButton label="New version" onClick={() => { setName(""); setNaming("new"); }}>
        <path d="M8 3v10M3 8h10" />
      </IconButton>
      {current && (
        <IconButton label="Duplicate this version" onClick={() => { setName(`${current.name} copy`); setNaming("copy"); }}>
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
          <path d="M10.5 3.5v-.4A1.6 1.6 0 0 0 8.9 1.5H4.1A1.6 1.6 0 0 0 2.5 3.1v4.8a1.6 1.6 0 0 0 1.6 1.6h.4" />
        </IconButton>
      )}
      {current && (
        <IconButton label="Rename this version" onClick={() => { setName(current.name); setNaming("rename"); }}>
          <path d="M10.5 2.5l3 3L6 13H3v-3z" />
        </IconButton>
      )}
      {changed && (
        <IconButton
          label={confirm === "reset" ? "Click again to undo every change" : "Reset to the master"}
          danger={confirm === "reset"}
          onClick={() => (confirm === "reset" ? (onReset(), setConfirm(null)) : arm("reset"))}
        >
          <path d="M3 8a5 5 0 1 0 1.5-3.5" /><path d="M3 2.5v3h3" />
        </IconButton>
      )}
      {current && (
        <IconButton
          label={confirm === "delete" ? "Click again to delete this version" : "Delete this version"}
          danger={confirm === "delete"}
          onClick={async () => {
            if (confirm !== "delete") return arm("delete");
            await deleteVersion(current.id);
            setConfirm(null);
            await go(base);
          }}
        >
          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
        </IconButton>
      )}
    </>
  );

  return (
    <Panel title="Versions" actions={actions}>
      <ul className="-mx-1 space-y-0.5">
        <VersionRow active={!current} name="Master" note="the whole CV" onClick={() => go(base)} />
        {versions.map((v) => (
          <VersionRow
            key={v.id}
            active={current?.id === v.id}
            name={v.name}
            note={v.careers.length ? `for ${v.careers.map((c) => c.company || "untitled").join(", ")}` : undefined}
            onClick={() => go(`${base}?v=${v.id}`)}
          />
        ))}
      </ul>

      {naming && (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mt-2 flex gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setNaming(null); }}
            placeholder={naming === "rename" ? "New name" : "e.g. Stripe – Backend"}
            {...NO_AUTOFILL}
            className="min-w-0 flex-1 rounded-md border border-n-200 bg-n-0 px-2.5 py-1.5 text-[12.5px] text-n-800 outline-none focus:border-rust-400"
          />
          <button type="submit" className="rounded-md bg-rust-500 px-2.5 text-[12px] font-semibold text-white hover:bg-rust-600">
            {naming === "rename" ? "Rename" : "Create"}
          </button>
        </form>
      )}

      {version && version.careers.length > 0 && (
        <p className="mt-3 text-[11.5px] text-n-500">
          Sent with{" "}
          {version.careers.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link href={`${LIVIO_BASE}/careers?q=${encodeURIComponent(c.company)}` as Route} className="font-medium text-rust-600 hover:underline">
                {c.company || "untitled"}{c.role ? ` (${c.role})` : ""}
              </Link>
            </span>
          ))}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-n-100 pt-3">
        <Small onClick={() => file.current?.click()}>Import JSON</Small>
        <Small
          onClick={() => download(new Blob([JSON.stringify(toExport(current?.name ?? "Master", doc), null, 2)], { type: "application/json" }), `cv-${slug(current?.name ?? "master")}.json`)}
        >
          Download JSON
        </Small>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          const parsed = await Promise.all(files.map(async (f) => {
            try { return JSON.parse(await f.text()); } catch { return null; }
          }));
          const res = await importVersions(parsed.filter(Boolean));
          const bad = res.failed + parsed.filter((p) => !p).length;
          setMessage(`${res.imported.length} imported${bad ? ` · ${bad} weren't CV files` : ""}`);
          if (res.imported[0]) await go(`${base}?v=${res.imported[0]}`);
        }}
      />
      {message && <p className="mt-2 text-[11.5px] text-n-500">{message}</p>}
    </Panel>
  );
}

function VersionRow({ active, name, note, onClick }: { active: boolean; name: string; note?: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
          active ? "bg-rust-100 text-rust-700" : "text-n-700 hover:bg-n-50",
        )}
      >
        <span className="truncate font-medium">{name}</span>
        {note && <span className="truncate text-[11.5px] text-n-400">{note}</span>}
      </button>
    </li>
  );
}

/* ── Content ────────────────────────────────────────────────────────────── */

function SectionGroup({ sec, state, update, onText }: {
  sec: Section;
  state: State;
  update: (f: (s: State) => State) => void;
  onText: (id: string, field: string, value: string) => void;
}) {
  const o = state.overrides;
  const master = !o;
  const text = (id: string, field: string, value: string | undefined, props: Partial<React.ComponentProps<typeof Field>> = {}) => (
    <Field value={value ?? ""} overridden={isOverridden(o, id, field)} onChange={(v) => onText(id, field, v)}
      onReset={() => update((x) => inherit(x, id, field))} {...props} />
  );
  const controls = (id: string) => (
    <span className="flex shrink-0 items-center">
      <Arrow dir="up" onClick={() => update((x) => move(x, id, -1))} />
      <Arrow dir="down" onClick={() => update((x) => move(x, id, 1))} />
      {master && <Remove onClick={() => update((x) => removeNode(x, id))} />}
    </span>
  );
  const item = (id: string, shown: boolean, children: React.ReactNode, head?: React.ReactNode) => (
    <div key={id} className={clsx("space-y-1.5 rounded-md border border-n-100 bg-n-25 p-2", !shown && "opacity-50")}>
      <div className="flex items-start gap-2">
        <Toggle on={shown} overridden={isOverridden(o, id)} onChange={(v) => update((x) => setOn(x, id, v))} onReset={() => update((x) => inherit(x, id))} />
        <div className="min-w-0 flex-1">{head}</div>
        {controls(id)}
      </div>
      {children}
    </div>
  );
  const add = (container: string, kind: string, label: string) => (
    <button type="button" onClick={() => update((x) => addNode(x, container, TEMPLATES[kind]() as never))}
      className="text-[12px] font-medium text-rust-600 hover:underline">
      + {label}
    </button>
  );

  return (
    <Group
      title={sec.title}
      off={!on(sec)}
      lead={<Toggle on={on(sec)} overridden={isOverridden(o, sec.id)} onChange={(v) => update((x) => setOn(x, sec.id, v))} onReset={() => update((x) => inherit(x, sec.id))} />}
      trail={controls(sec.id)}
    >
      {text(sec.id, "title", sec.title, { label: "Heading" })}
      {sec.type === "text" && text(sec.id, "text", sec.text, { area: true })}

      {sec.type === "stats" && (
        <>
          {sec.items.map((it) => item(it.id, on(it), text(it.id, "label", it.label, { small: true }), text(it.id, "value", it.value, { small: true })))}
          {add(sec.id, "stats", "Add stat")}
        </>
      )}

      {sec.type === "entries" && (
        <>
          {sec.items.map((it) => item(
            it.id, on(it),
            <>
              <div className="flex gap-1.5">
                {text(it.id, "org", it.org, { small: true, className: "min-w-0 flex-1", placeholder: "Company" })}
                {text(it.id, "date", it.date, { small: true, className: "w-[118px] shrink-0" })}
              </div>
              {text(it.id, "tags", it.tags, { small: true, placeholder: "Stack, comma separated - gives the role a badge" })}
              {it.bullets.map((b) => (
                <div key={b.id} className={clsx("flex items-start gap-2 pl-1", !on(b) && "opacity-50")}>
                  <Toggle on={on(b)} overridden={isOverridden(o, b.id)} onChange={(v) => update((x) => setOn(x, b.id, v))} onReset={() => update((x) => inherit(x, b.id))} />
                  {text(b.id, "t", b.t, { small: true, area: true, className: "min-w-0 flex-1" })}
                  {controls(b.id)}
                </div>
              ))}
              {add(it.id, "bullet", "Add bullet")}
            </>,
            text(it.id, "title", it.title, { small: true }),
          ))}
          {add(sec.id, "entries", "Add entry")}
        </>
      )}

      {sec.type === "skills" && (
        <>
          {sec.items.map((it) => item(it.id, on(it), text(it.id, "text", it.text, { small: true, area: true }), text(it.id, "label", it.label, { small: true })))}
          {add(sec.id, "skills", "Add row")}
        </>
      )}

      {sec.type === "list" && (
        <>
          <label className="flex items-center gap-2 text-[12px] text-n-600">
            <input type="checkbox" checked={sec.cols === 2} onChange={(e) => update((x) => setCols(x, sec.id, e.target.checked ? 2 : 1))} className="accent-[var(--color-rust-500)]" />
            Two columns
          </label>
          {sec.items.map((it) => item(it.id, on(it), text(it.id, "text", it.text, { small: true, area: true }), text(it.id, "title", it.title, { small: true })))}
          {add(sec.id, "list", "Add item")}
        </>
      )}
    </Group>
  );
}

TEMPLATES.bullet = () => ({ id: newId(), t: "New bullet" });

/* ── Small pieces ───────────────────────────────────────────────────────── */

function Panel({ title, hint, actions, children }: { title: string; hint?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-n-100 bg-n-0 p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <Eyebrow>{title}</Eyebrow>
        {actions && <div className="-my-1 -mr-1 flex items-center gap-0.5">{actions}</div>}
      </div>
      {hint && <p className="-mt-1 mb-2.5 text-[11.5px] leading-4 text-n-400">{hint}</p>}
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Group({ title, open, off, lead, trail, children }: {
  title: string;
  open?: boolean;
  off?: boolean;
  lead?: React.ReactNode;
  trail?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group/d rounded-md border border-n-100">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-[12.5px] [&::-webkit-details-marker]:hidden">
        {lead && <span onClick={(e) => e.stopPropagation()}>{lead}</span>}
        <span className={clsx("flex-1 truncate font-medium", off ? "text-n-400 line-through" : "text-n-800")}>{title}</span>
        {trail && <span onClick={(e) => e.preventDefault()}>{trail}</span>}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0 text-n-400 transition-transform group-open/d:rotate-180">
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="space-y-2 border-t border-n-100 p-2.5">{children}</div>
    </details>
  );
}

/** A field in the panel. In a version, one that differs from the master gets
 *  a violet dot, and a ↺ to take the master's wording back. */
function Field({ label, value, onChange, overridden, onReset, area, small, className, placeholder }: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  overridden?: boolean;
  onReset?: () => void;
  area?: boolean;
  small?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const cls = clsx(
    "w-full rounded-md border bg-n-0 px-2 py-1 text-n-800 outline-none transition-colors focus:border-rust-400",
    small ? "text-[12px]" : "text-[12.5px]",
    overridden ? "border-rust-300" : "border-n-200",
  );
  return (
    <label className={clsx("block", className)}>
      {label && <span className="mb-0.5 block text-[11px] font-medium text-n-500">{label}</span>}
      <span className="relative flex items-start gap-1">
        {area ? (
          <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={2} {...NO_AUTOFILL}
            className={clsx(cls, "resize-y leading-[1.35] [field-sizing:content]")} />
        ) : (
          <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} {...NO_AUTOFILL} className={cls} />
        )}
        <Mark show={!!overridden} onReset={onReset} />
      </span>
    </label>
  );
}

function Mark({ show, onReset }: { show: boolean; onReset?: () => void }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); onReset?.(); }}
      title="Changed in this version - click for the master's"
      aria-label="Use the master's"
      className="mt-1 flex h-5 shrink-0 items-center gap-0.5 rounded px-1 text-[11px] font-medium text-rust-600 hover:bg-rust-50"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rust-500" />↺
    </button>
  );
}

function Toggle({ on: value, onChange, overridden, onReset }: { on: boolean; onChange: (v: boolean) => void; overridden?: boolean; onReset?: () => void }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5 pt-1">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--color-rust-500)]"
        title={value ? "Shown - untick to hide" : "Hidden - tick to show"} />
      {overridden && (
        <button type="button" onClick={(e) => { e.preventDefault(); onReset?.(); }} title="Shown or hidden differently from the master - click for the master's"
          className="h-1.5 w-1.5 rounded-full bg-rust-500" aria-label="Use the master's" />
      )}
    </span>
  );
}

function Arrow({ dir, onClick }: { dir: "up" | "down"; onClick: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); onClick(); }} aria-label={dir === "up" ? "Move up" : "Move down"}
      className="flex h-6 w-5 items-center justify-center rounded text-n-400 hover:bg-n-100 hover:text-n-700">
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden className={dir === "down" ? "rotate-180" : ""}>
        <path d="M2 6.5L5 3.5l3 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function Remove({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); onClick(); }} aria-label="Delete from the master" title="Delete from the master (and every version)"
      className="flex h-6 w-5 items-center justify-center rounded text-n-400 hover:bg-danger-soft hover:text-danger">
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
    </button>
  );
}

function Small({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-n-200 px-2 py-1 text-[11.5px] font-medium text-n-600 transition-colors hover:bg-n-50 hover:text-n-800"
    >
      {children}
    </button>
  );
}

/** A square icon button; its label is its tooltip and its name. */
function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-[120ms]",
        danger ? "bg-danger-soft text-danger" : "text-n-500 hover:bg-n-100 hover:text-n-800",
      )}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

void Kbd;
