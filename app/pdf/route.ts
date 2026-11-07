import { NextRequest } from "next/server";
import { isPdfSrc, pdfTabHtml } from "@/lib/pdfTab";

/**
 * A PDF in a tab of its own, with the PDF icon rather than Studio's house.
 * `/pdf?src=/api/…&title=…` - build links with pdfTab() (lib/pdfTab.ts).
 * The file still comes from its own route, so the viewer's download button
 * keeps that route's filename.
 */
export function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("src") ?? "";
  if (!isPdfSrc(src)) return new Response("Not a Studio PDF.", { status: 400 });
  const title = req.nextUrl.searchParams.get("title")?.trim() || "PDF";
  return new Response(pdfTabHtml(src, title), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
