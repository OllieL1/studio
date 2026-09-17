import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { exchangeCode, GOOGLE_SCOPES } from "@/lib/google";

/** Google redirects back here with an authorisation code. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const base = `${url.protocol}//${url.host}`;
  const fail = (why: string) =>
    NextResponse.redirect(new URL(`/settings?google=${why}`, base));

  if (url.searchParams.get("error")) return fail("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("missing_code");

  const jar = await cookies();
  const expected = jar.get("google_oauth_state")?.value;
  jar.delete("google_oauth_state");
  if (!expected || expected !== state) return fail("bad_state");

  try {
    const token = await exchangeCode(code);

    // Without a refresh token the connection dies in an hour and can't recover.
    if (!token.refresh_token) {
      const existing = await db.googleAuth.findUnique({ where: { id: "singleton" } });
      if (!existing) return fail("no_refresh_token");
    }

    const email = token.id_token ? emailFromIdToken(token.id_token) : null;
    const expiresAt = new Date(Date.now() + token.expires_in * 1000);

    await db.googleAuth.upsert({
      where: { id: "singleton" },
      update: {
        accessToken: token.access_token,
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
        expiresAt,
        scope: token.scope ?? GOOGLE_SCOPES,
        ...(email ? { email } : {}),
      },
      create: {
        id: "singleton",
        accessToken: token.access_token,
        refreshToken: token.refresh_token!,
        expiresAt,
        scope: token.scope ?? GOOGLE_SCOPES,
        email,
      },
    });

    return NextResponse.redirect(new URL("/settings?google=connected", base));
  } catch {
    return fail("exchange_failed");
  }
}

/** Read the email claim without verifying — it's display-only, and the token
 *  came straight from Google's endpoint over TLS. */
function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1];
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return (JSON.parse(json) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
}
