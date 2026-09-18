import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { exchangeSpotifyCode, fetchDisplayName } from "@/lib/spotify";

/** Spotify redirects here (on 127.0.0.1). Tokens go in the DB, then back to the app on localhost. */
export async function GET(req: NextRequest) {
  const back = (result: string) =>
    NextResponse.redirect(new URL(`/settings?spotify=${result}`, "http://localhost:3000"));

  if (req.nextUrl.searchParams.get("error")) return back("denied");

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return back("missing_code");

  const jar = await cookies();
  const expected = jar.get("spotify_oauth_state")?.value;
  jar.delete("spotify_oauth_state");
  if (!expected || expected !== state) return back("bad_state");

  try {
    const token = await exchangeSpotifyCode(code);
    const displayName = await fetchDisplayName(token.access_token);
    const data = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      displayName,
      scope: token.scope ?? null,
    };
    await db.spotifyAuth.upsert({
      where: { id: "singleton" },
      update: data,
      create: { id: "singleton", ...data },
    });
    return back("connected");
  } catch {
    return back("exchange_failed");
  }
}
