import { createRequire } from "node:module";
import SVGtoPDF from "svg-to-pdfkit";

/**
 * Typeset maths in the PDFs.
 *
 * MathJax converts LaTeX to SVG with the glyphs as paths, so nothing has to be
 * fetched and no maths font has to be embedded; svg-to-pdfkit then draws those
 * paths straight into the document. That keeps the export working offline from
 * the USB stick, and means an equation prints as an equation rather than as
 * its source.
 *
 * MathJax is loaded lazily and kept for the life of the process - starting it
 * up costs about a tenth of a second, and an export can hold many equations.
 */

// MathJax v3 ships CommonJS entry points only.
const require = createRequire(import.meta.url);

type Converter = (tex: string, display: boolean) => string;
let convert: Converter | null = null;

function converter(): Converter {
  if (convert) return convert;

  const { mathjax } = require("mathjax-full/js/mathjax.js");
  const { TeX } = require("mathjax-full/js/input/tex.js");
  const { SVG } = require("mathjax-full/js/output/svg.js");
  const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js");
  const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js");
  const { AllPackages } = require("mathjax-full/js/input/tex/AllPackages.js");

  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  // fontCache "none" inlines every glyph path: the cache uses <use> against
  // ids shared across one page, which doesn't survive being drawn per block.
  const doc = mathjax.document("", {
    // Bad LaTeX should raise, so the caller can fall back to the source.
    // Left to itself MathJax draws its own error box into the page.
    InputJax: new TeX({
      packages: AllPackages,
      formatError: (_jax: unknown, err: Error) => {
        throw err;
      },
    }),
    OutputJax: new SVG({ fontCache: "none" }),
  });

  convert = (tex, display) => adaptor.innerHTML(doc.convert(tex, { display }));
  return convert;
}

/** How many points one MathJax "ex" is, at a given body size. */
const EX = 0.45;

export type Maths = {
  svg: string;
  width: number;
  height: number;
  /** How far the maths hangs below the baseline, in points. */
  descent: number;
};

const cache = new Map<string, Maths | null>();

/** Lay out one expression. Returns null if the LaTeX doesn't parse. */
export function measureMath(tex: string, size: number, display: boolean): Maths | null {
  const key = `${display ? "d" : "i"}:${size}:${tex}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let result: Maths | null = null;
  try {
    const raw = converter()(tex, display);
    const width = parseFloat(/width="([\d.]+)ex"/.exec(raw)?.[1] ?? "0") * size * EX;
    const height = parseFloat(/height="([\d.]+)ex"/.exec(raw)?.[1] ?? "0") * size * EX;
    const valign = parseFloat(/vertical-align:\s*(-?[\d.]+)ex/.exec(raw)?.[1] ?? "0");
    if (width > 0 && height > 0) {
      // Restate the size in user units, which svg-to-pdfkit reads as points
      // under `assumePt`. MathJax writes "ex", and a "pt" value here gets
      // converted as if it were px - 4/3 too wide, so the next word collided
      // with the end of the equation.
      const svg = raw
        .replace(/width="[\d.]+ex"/, `width="${width.toFixed(3)}"`)
        .replace(/height="[\d.]+ex"/, `height="${height.toFixed(3)}"`);
      result = { svg, width, height, descent: Math.abs(valign) * size * EX };
    }
  } catch {
    result = null;
  }

  cache.set(key, result);
  return result;
}

/** Draw pre-measured maths with its top-left at (x, y). */
export function drawMath(doc: PDFKit.PDFDocument, maths: Maths, x: number, y: number) {
  // The size lives on the SVG element itself; the options are ignored for it.
  SVGtoPDF(doc, maths.svg, x, y, { assumePt: true });
}

/** The font's ascent in points - where a line's baseline sits below its top. */
export function ascent(doc: PDFKit.PDFDocument, size: number): number {
  const font = (doc as unknown as { _font?: { ascender?: number } })._font;
  const ascender = font?.ascender ?? 800;
  return (ascender / 1000) * size;
}
