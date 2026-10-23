import { NextResponse, type NextRequest } from "next/server";
import { LOOPBACK_ORIGIN } from "@/lib/origin";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { buildAuthUrl, isGoogleConfigured } from "@/lib/google";

/** Where to land afterwards: Studio's settings unless the request came from
 *  somewhere else in the app (Livio's preferences). Paths only, so this can't
 *  be turned into an open redirect. */
function returnPath(req: NextRequest): string {
  const r = req.nextUrl.searchParams.get("return");
  return r && /^\/(?![/\\])/.test(r) ? r : "/settings";
}

/** Kicks off the OAuth flow. */
export async function GET(req: NextRequest) {
  const back = returnPath(req);
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL(`${back}?google=unconfigured`, LOOPBACK_ORIGIN),
    );
  }

  // CSRF guard: a random state echoed back by Google and checked on return.
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  jar.set("google_oauth_return", back, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });

  return NextResponse.redirect(buildAuthUrl(state));
}
