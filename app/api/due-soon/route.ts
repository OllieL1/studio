import { NextResponse } from "next/server";
import { getDueSoon } from "@/lib/queries";

/** Polled by the due-soon banner. Never errors - the banner just stays as it was. */
export async function GET() {
  try {
    return NextResponse.json(await getDueSoon(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(null);
  }
}
