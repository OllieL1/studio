import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Used by the USB launcher to know when Studio is ready, and to tell "Studio
 * is already running" apart from "something else is using Studio's port". It also
 * touches the database, so a bad database path shows up as a clear error at
 * startup instead of a broken page later.
 */
export async function GET() {
  try {
    // Read a real table. `SELECT 1` never touches the database file, so a
    // corrupt or empty file would still pass; this proves the file opens and
    // Studio's tables are there.
    await db.course.count();
    // "mode" lets the USB launcher tell the live app apart from the
    // development server, which also answers on the same port.
    return NextResponse.json({ app: "studio", ok: true, mode: process.env.NODE_ENV });
  } catch (e) {
    return NextResponse.json(
      { app: "studio", ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
