"use client";

import { useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { completeFolder } from "@/lib/kb";
import { clsx } from "@/lib/clsx";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /** The KB's folders (lib/kb.ts foldersOf). */
  folders: string[];
  /** Layout classes for the wrapper - the input fills it. */
  wrapperClassName?: string;
};

/**
 * A doc-path box that completes folder names: what Tab would add shows in
 * grey after the caret, and Tab (or → at the end) takes it. With nothing to
 * complete, Tab moves on as usual.
 */
export function FolderPathInput({ value, onChange, folders, wrapperClassName, className, onKeyDown, ...rest }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [atEnd, setAtEnd] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});

  const completion = completeFolder(value, folders);
  const suffix = completion && atEnd ? completion.slice(value.length) : "";

  // The grey text sits exactly where the typed text ends: same font and
  // padding as the input, shifted by however far it's scrolled.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !suffix) return;
    const cs = getComputedStyle(el);
    setStyle({
      paddingLeft: `calc(${cs.paddingLeft} + ${cs.borderLeftWidth})`,
      font: cs.font,
      fontFeatureSettings: cs.fontFeatureSettings,
      fontVariantNumeric: cs.fontVariantNumeric,
      letterSpacing: cs.letterSpacing,
      transform: `translateX(${-el.scrollLeft}px)`,
    });
  }, [value, suffix]);

  const sync = () => {
    const el = ref.current;
    setAtEnd(!!el && document.activeElement === el && el.selectionStart === el.value.length && el.selectionEnd === el.value.length);
  };

  const accept = (e: KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    onChange(completion!);
    // The caret follows to the new end once React has written the value.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) { el.setSelectionRange(el.value.length, el.value.length); el.scrollLeft = el.scrollWidth; }
      sync();
    });
  };

  return (
    <div className={clsx("relative", wrapperClassName)}>
      <input
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (suffix && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "Tab" || e.key === "ArrowRight")) return accept(e);
          onKeyDown?.(e);
        }}
        onSelect={sync}
        onFocus={sync}
        onBlur={() => setAtEnd(false)}
        autoComplete="off"
        spellCheck={false}
        className={clsx("w-full", className)}
      />
      {suffix && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre">
          <span style={style}>
            <span className="invisible">{value}</span>
            <span className="text-n-400">{suffix}</span>
          </span>
        </div>
      )}
    </div>
  );
}
