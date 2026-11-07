/**
 * PDFs open in their own tab through `/pdf` (app/pdf/route.ts), a bare page
 * that frames the file. A PDF served on its own can't carry an icon, so the
 * browser falls back to the site's favicon and every PDF tab looked like
 * another Studio tab. The wrapper has its own icon and a real title.
 *
 * Pure - no database - so client components can import it.
 */

/** Only Studio's own files: a path on this origin, under /api/. Anything else
 *  would make /pdf a frame for any site. */
export function isPdfSrc(src: string): boolean {
  return src.startsWith("/api/") && !src.includes("\\") && !/[\u0000-\u001f]/.test(src);
}

/** The link to open `src` (an /api/… PDF route) in a PDF tab, titled `title`. */
export function pdfTab(src: string, title?: string): string {
  const q = new URLSearchParams({ src });
  if (title) q.set("title", title);
  return `/pdf?${q}`;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The wrapper page itself. `src` must already have passed isPdfSrc.
 *
 * The icon is the Files tab's pink "PDF" pill (public/pdf-icon.svg), with
 * PNG copies: some browsers - Safari among them - ignore an SVG icon and show
 * their own PDF glyph instead. `?v=` busts a cached older icon; bump it when
 * the artwork changes.
 */
export function pdfTabHtml(src: string, title: string): string {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="/pdf-icon-32.png?v=2" type="image/png" sizes="32x32">
<link rel="icon" href="/pdf-icon-16.png?v=2" type="image/png" sizes="16x16">
<link rel="icon" href="/pdf-icon-48.png?v=2" type="image/png" sizes="48x48">
<link rel="icon" href="/pdf-icon.svg?v=2" type="image/svg+xml">
<link rel="apple-touch-icon" href="/pdf-icon-180.png?v=2">
<style>
  html, body { margin: 0; height: 100%; background: #525659; overflow: hidden; }
  iframe { display: block; border: 0; width: 100%; height: 100%; }
</style>
</head>
<body>
<iframe src="${escapeHtml(src)}" title="${escapeHtml(title)}"></iframe>
</body>
</html>
`;
}
