/**
 * A reading share card: a 1200×630 PNG drawn straight onto a canvas in the
 * browser - the size link previews use, so it sits well in a message - in
 * Livio's violet whatever theme the app is in. Uses the page's own Fraunces
 * and Inter, waiting for them so the card never falls back to a system face.
 */

export type ShareItem = {
  title: string;
  author: string | null;
  typeLabel: string;
  rating: number | null;
  takeaway: string | null;
  /** e.g. "Finished 2 Oct 2026 · 9 days" */
  footnote: string | null;
};

const W = 1200;
const H = 630;
const PAD = 80;
const INK = "#18171b";
const MUTED = "#6f6d79";
const FAINT = "#8f8d9b";
const VIOLET = "#7e70b7";
const VIOLET_SOFT = "#cfcbea";
const PAPER = "#fafafc";

function family(variable: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v || fallback;
}

/** Lines that fit `width`, at most `max`, the last ending in … if cut short. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width) line = next;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (ctx.measureText(`${last}…`).width > width && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" "));
  kept[max - 1] = `${last}…`;
  return kept;
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? outer * 0.45 : outer;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (k) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

export async function drawShareCard(item: ShareItem): Promise<Blob> {
  const display = family("--font-fraunces", "Georgia, serif");
  const sans = family("--font-inter", "system-ui, sans-serif");
  await Promise.all([
    document.fonts.load(`600 64px ${display}`),
    document.fonts.load(`400 28px ${sans}`),
    document.fonts.load(`italic 400 28px ${sans}`),
  ]).catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = VIOLET;
  ctx.fillRect(0, 0, 12, H);

  // The wordmark, top right: "Liv" in ink, "io" in violet.
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 30px ${display}`;
  const io = ctx.measureText("io").width;
  const liv = ctx.measureText("Liv").width;
  ctx.fillStyle = VIOLET;
  ctx.fillText("io", W - PAD - io, PAD + 22);
  ctx.fillStyle = INK;
  ctx.fillText("Liv", W - PAD - io - liv, PAD + 22);

  let y = PAD + 22;
  ctx.font = `600 22px ${sans}`;
  ctx.fillStyle = FAINT;
  ctx.fillText(item.typeLabel.toUpperCase().split("").join(String.fromCharCode(8202)), PAD, y);

  y += 30;
  ctx.font = `600 64px ${display}`;
  ctx.fillStyle = INK;
  for (const line of wrap(ctx, item.title || "Untitled", W - PAD * 2 - 140, item.takeaway ? 2 : 3)) {
    y += 70;
    ctx.fillText(line, PAD, y);
  }

  if (item.author) {
    y += 48;
    ctx.font = `400 30px ${sans}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(wrap(ctx, item.author, W - PAD * 2, 1)[0], PAD, y);
  }

  if (item.rating != null) {
    y += 44;
    for (let k = 0; k < 5; k++) {
      const cx = PAD + 16 + k * 40;
      star(ctx, cx, y - 2, 16);
      ctx.fillStyle = VIOLET_SOFT;
      ctx.fill();
      const fill = Math.max(0, Math.min(1, item.rating - k));
      if (fill > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - 16, y - 20, 32 * fill, 40);
        ctx.clip();
        star(ctx, cx, y - 2, 16);
        ctx.fillStyle = VIOLET;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  if (item.takeaway) {
    ctx.font = `italic 400 28px ${sans}`;
    const lines = wrap(ctx, `“${item.takeaway}”`, W - PAD * 2 - 28, 2);
    const top = H - PAD - 34 - lines.length * 38;
    ctx.fillStyle = VIOLET_SOFT;
    ctx.fillRect(PAD, top - 4, 4, lines.length * 38 + 2);
    ctx.fillStyle = INK;
    lines.forEach((l, i) => ctx.fillText(l, PAD + 28, top + 26 + i * 38));
  }

  if (item.footnote) {
    ctx.font = `400 22px ${sans}`;
    ctx.fillStyle = FAINT;
    ctx.fillText(item.footnote, PAD, H - PAD + 18);
  }

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No image"))), "image/png"));
}

/** Hand a blob to the browser as a download. */
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "reading";
}
