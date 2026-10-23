"use client";

import { League_Spartan } from "next/font/google";
import { useLayoutEffect, useRef } from "react";
import { BADGE_GLYPHS } from "@/lib/cv/glyphs";
import { on, type CvDoc, type Entry } from "@/lib/cv/model";
import "./sheet.css";

const spartan = League_Spartan({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-spartan", display: "swap" });

/** Edits made on the sheet itself: which thing, which field, what it now says. */
export type OnText = (id: string, field: string, value: string) => void;

/**
 * Text you edit where it sits, like the old builder. React writes it once
 * and then leaves it alone while it has the caret, so typing never jumps;
 * when the value changes from outside (the sidebar, an undo) it's rewritten.
 */
function E({ as: Tag = "span", className, id, field, value, ph, onText }: {
  as?: "span" | "div" | "p" | "h1" | "li" | "b";
  className?: string;
  id: string;
  field: string;
  value: string | undefined;
  ph?: string;
  onText?: OnText;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== (value ?? "")) el.textContent = value ?? "";
  }, [value]);

  if (!onText) return <Tag className={className}>{value}</Tag>;
  return (
    <Tag
      ref={ref as never}
      className={className}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      data-ph={ph ?? "…"}
      onInput={(e) => onText(id, field, (e.currentTarget as HTMLElement).textContent ?? "")}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain").replace(/\s+/g, " "));
      }}
    />
  );
}

/** A role's letter badge: a vector outline, not text, so it's exactly centred at any size. */
function Badge({ letter, small }: { letter: string; small?: boolean }) {
  return (
    <span className={`key${small ? " sm" : ""}`}>
      <svg viewBox="-4 -4 108 108" aria-hidden>
        <circle cx="50" cy="50" r="50" fill="#0c0c10" />
        <path d={BADGE_GLYPHS[letter] ?? ""} fill="#fff" />
      </svg>
    </span>
  );
}

/** Where a contact line should link, read from what it says - so editing the text keeps the link right. */
export function hrefFor(text: string): string | null {
  const t = (text || "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return `mailto:${t}`;
  if (/^\+?[\d\s()-]{7,}$/.test(t)) return `tel:${t.replace(/[^\d+]/g, "")}`;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`;
  return null;
}

/** "React, Node.js (Express, Fastify), SQL" - commas inside brackets don't split. */
export function splitSkills(t: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of t) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}

/**
 * The A4 sheet, laid out at 4× and scaled down (see .cvs in sheet.css). Pass
 * `onText` to make it editable; leave it off for a read-only render.
 */
export function CvSheet({ doc, onText, sheetRef, over }: {
  doc: CvDoc;
  onText?: OnText;
  sheetRef?: React.Ref<HTMLDivElement>;
  over?: boolean;
}) {
  // Every visible role that lists skills gets a letter; skills point back to it.
  const base = (t: string) => t.replace(/\s*\(.*\)\s*$/, "").toLowerCase();
  const keys = new Map<Entry, string>();
  const roles: { letter: string; skills: Set<string> }[] = [];
  for (const s of doc.sections.filter(on)) {
    if (s.type !== "entries") continue;
    for (const it of s.items.filter(on)) {
      if (!(it.tags ?? "").trim()) continue;
      const letter = String.fromCharCode(65 + roles.length);
      keys.set(it, letter);
      roles.push({ letter, skills: new Set(splitSkills(it.tags!).map((t) => t.toLowerCase())) });
    }
  }

  const contact = doc.contact.filter(on);
  const item = (k: CvDoc["contact"][number]) => {
    const href = hrefFor(k.text);
    return (
      <div className="ci" key={k.id}>
        <small>{k.label}</small>
        <a className="ci-link" href={href ?? undefined} onClick={onText ? (e) => e.preventDefault() : undefined}>
          <E id={k.id} field="text" value={k.text} onText={onText} />
        </a>
      </div>
    );
  };
  const stacked = contact.filter((k) => k.stack);
  const row = contact.filter((k) => !k.stack);

  return (
    <div
      ref={sheetRef}
      className={`cvs ${spartan.variable}${over ? " over" : ""}`}
      style={{ ["--accent" as string]: doc.accent, ["--on-accent" as string]: luminance(doc.accent) > 0.42 ? "#0c0c10" : "#ffffff" }}
    >
      <div className="inner">
        <header className="hdr">
          <div className="hdr-top">
            <div className="who">
              <E as="h1" className="nm" id="cv" field="name" value={doc.name} ph="Your name" onText={onText} />
              <E as="div" className="tag" id="cv" field="headline" value={doc.headline} ph="Headline" onText={onText} />
            </div>
            <div className="stack">{stacked.map(item)}</div>
          </div>
          {row.length > 0 && <div className="contact">{row.map(item)}</div>}
        </header>

        <div className="bd">
          {doc.sections.filter(on).map((sec) => (
            <section key={sec.id}>
              {sec.type !== "text" && sec.type !== "stats" && (
                <div className="sec-h">
                  <h2><E id={sec.id} field="title" value={sec.title} onText={onText} /></h2>
                </div>
              )}

              {sec.type === "text" && <E as="p" className="lead" id={sec.id} field="text" value={sec.text} onText={onText} />}

              {sec.type === "stats" && (
                <div className="stats">
                  {sec.items.filter(on).map((it) => (
                    <div className="stat" key={it.id}>
                      <E as="b" id={it.id} field="value" value={it.value} onText={onText} />
                      <E as="div" id={it.id} field="label" value={it.label} onText={onText} />
                    </div>
                  ))}
                </div>
              )}

              {sec.type === "entries" && sec.items.filter(on).map((it) => (
                <div className="entry" key={it.id}>
                  <div className="eh">
                    <div className="et">
                      {keys.has(it) && <><Badge letter={keys.get(it)!} />{" "}</>}
                      <E id={it.id} field="title" value={it.title} onText={onText} />
                      {it.org != null && <E className="org" id={it.id} field="org" value={it.org} onText={onText} />}
                    </div>
                    <E as="div" className="dt" id={it.id} field="date" value={it.date} onText={onText} />
                  </div>
                  <ul className="bl">
                    {it.bullets.filter(on).map((b) => <E as="li" key={b.id} id={b.id} field="t" value={b.t} onText={onText} />)}
                  </ul>
                </div>
              ))}

              {sec.type === "skills" && (
                <dl className="sk">
                  {sec.items.filter(on).map((it) => (
                    <SkillRow key={it.id} label={it.label} text={it.text} roles={roles} base={base} />
                  ))}
                </dl>
              )}

              {sec.type === "list" && (
                <ul className={`nl${sec.cols === 2 ? " cols2" : ""}`}>
                  {sec.items.filter(on).map((it) => (
                    <li key={it.id}>
                      <E as="b" id={it.id} field="title" value={it.title} onText={onText} />
                      {" - "}
                      <E id={it.id} field="text" value={it.text} onText={onText} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
      <div className="pgline" />
    </div>
  );
}

function SkillRow({ label, text, roles, base }: {
  label: string;
  text: string;
  roles: { letter: string; skills: Set<string> }[];
  base: (t: string) => string;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {splitSkills(text).map((t, i) => {
          const hits = roles.filter((r) => r.skills.has(base(t)));
          return (
            <span className="chip" key={`${t}-${i}`}>
              {t}
              {hits.map((r) => <Badge key={r.letter} letter={r.letter} small />)}
            </span>
          );
        })}
      </dd>
    </>
  );
}
