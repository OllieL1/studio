import { NextResponse, type NextRequest } from "next/server";
import { LIVIO_HOST_ALIAS } from "@/lib/origin";
import { LIVIO_BASE } from "@/lib/apps";

/**
 * livio.localhost's front door. Studio and Livio are one process; on the
 * Livio alias, `/` shows Livio's home instead of Studio's. Every other path
 * passes straight through - Livio's own links already carry /livio, and
 * cross-app links pick the right host themselves (lib/apps.ts).
 */
export function proxy(req: NextRequest) {
  const host = req.headers.get("host")?.split(":")[0];
  if (host === LIVIO_HOST_ALIAS) {
    return NextResponse.rewrite(new URL(LIVIO_BASE, req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
