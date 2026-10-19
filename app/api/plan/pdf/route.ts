import type { NextRequest } from "next/server";
import { toISODate } from "@/lib/dates";
import { planRange } from "@/lib/plan";
import { getPlan } from "@/lib/planData";
import { buildDays } from "@/lib/planView";
import { buildPlanPdf } from "@/lib/pdf/plan";

export const dynamic = "force-dynamic";
// pdfkit reads its font files from disk, so this can't run on the edge.
export const runtime = "nodejs";

/** The weekly schedule as a PDF: an overview, then a page per day. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const range = planRange({ from: p.get("from") ?? undefined, days: p.get("days") ?? undefined });
  const plan = await getPlan(range.from, range.days);

  const days = buildDays({
    from: range.from,
    days: range.days,
    fixed: plan.fixed,
    blocks: plan.blocks,
    hidden: new Set(plan.hidden),
    showHidden: new Set(),
  });

  const pdf = await buildPlanPdf({
    from: range.from,
    days,
    courses: new Map(plan.courses.map((c) => [c.id, { shortName: c.shortName, colour: c.colour }])),
    generatedAt: new Date(),
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="studio-schedule-${toISODate(range.from)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
