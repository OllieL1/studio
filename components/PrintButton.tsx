"use client";

import { useEffect } from "react";

/**
 * Triggers the browser's print dialog, from which "Save as PDF" produces the
 * document. Deliberately not a JS PDF library: the browser's own engine gives
 * far better typography, hyphenation and page-breaking, handles the print
 * stylesheet in globals.css, and adds no dependency to keep alive.
 */
export function PrintButton({ auto = false }: { auto?: boolean }) {
  useEffect(() => {
    if (!auto) return;
    // Wait for fonts, otherwise the first page can print in a fallback face.
    const t = setTimeout(() => {
      document.fonts?.ready.then(() => window.print());
    }, 400);
    return () => clearTimeout(t);
  }, [auto]);

  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-md bg-rust-500 px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors duration-[120ms] hover:bg-rust-600"
    >
      Save as PDF
    </button>
  );
}
