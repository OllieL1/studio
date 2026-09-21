import { NextRequest, NextResponse } from "next/server";
import { renderMarkdown } from "@/lib/markdown";

/**
 * Markdown → HTML for the editor, using the same renderer as the printed PDF
 * so what you see is what you export.
 *
 * `{ markdown }` renders one string; `{ blocks: [...] }` renders many in one
 * round trip, which is what the live editor uses.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (Array.isArray(body?.blocks)) {
    if (body.blocks.some((b: unknown) => typeof b !== "string")) {
      return NextResponse.json({ error: "blocks must be strings" }, { status: 400 });
    }
    return NextResponse.json({ html: (body.blocks as string[]).map(renderMarkdown) });
  }

  if (typeof body?.markdown !== "string") {
    return NextResponse.json({ error: "markdown must be a string" }, { status: 400 });
  }
  return NextResponse.json({ html: renderMarkdown(body.markdown) });
}
