import { NextRequest, NextResponse } from "next/server";
import { renderMarkdown } from "@/lib/markdown";

/** Renders markdown for the live preview, using the same renderer as the
 *  printed PDF so what you see is what you export. */
export async function POST(req: NextRequest) {
  const { markdown } = await req.json();
  if (typeof markdown !== "string") {
    return NextResponse.json({ error: "markdown must be a string" }, { status: 400 });
  }
  return NextResponse.json({ html: renderMarkdown(markdown) });
}
