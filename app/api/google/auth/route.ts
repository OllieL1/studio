import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { buildAuthUrl, isGoogleConfigured } from "@/lib/google";

/** Kicks off the OAuth flow. */
export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?google=unconfigured", "http://localhost:3000"),
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

  return NextResponse.redirect(buildAuthUrl(state));
}
