import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { buildSpotifyAuthUrl, isSpotifyConfigured, SPOTIFY_LOOPBACK_ORIGIN } from "@/lib/spotify";

/**
 * Starts the Spotify OAuth flow.
 *
 * Spotify redirects back to 127.0.0.1 (it forbids `localhost`), and a cookie
 * set on localhost isn't visible on 127.0.0.1 — so if this was opened on
 * localhost, bounce to the same route on 127.0.0.1 first and set the state
 * cookie there.
 */
export async function GET(req: NextRequest) {
  // Read the real Host header — Next's dev server normalises req.nextUrl to
  // localhost, which made a nextUrl check redirect 127.0.0.1 to itself forever.
  const loopback = new URL(SPOTIFY_LOOPBACK_ORIGIN);
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0];
  if (host !== loopback.hostname) {
    return NextResponse.redirect(new URL("/api/spotify/auth", SPOTIFY_LOOPBACK_ORIGIN));
  }

  if (!isSpotifyConfigured()) {
    return NextResponse.redirect(new URL("/settings?spotify=unconfigured", "http://localhost:3000"));
  }

  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("spotify_oauth_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return NextResponse.redirect(buildSpotifyAuthUrl(state));
}
