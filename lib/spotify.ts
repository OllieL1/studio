import { db } from "./db";
import { SPOTIFY_REDIRECT_URI } from "./origin";

/**
 * Spotify "now playing" — read-only.
 *
 * Spotify forbids `localhost` in redirect URIs; loopback must be an IP literal
 * (https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).
 * So the flow runs on 127.0.0.1, and the auth route bounces there first — the
 * CSRF state cookie must be set on the same host Spotify redirects back to.
 */

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

/** now-playing, plus listening history so a session's music can be filled in
 *  for stretches the app wasn't open. */
export const SPOTIFY_SCOPES = "user-read-currently-playing user-read-recently-played";
export const HISTORY_SCOPE = "user-read-recently-played";
export { SPOTIFY_LOOPBACK_ORIGIN } from "./origin";

export function spotifyConfig() {
  return {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri:
      process.env.SPOTIFY_REDIRECT_URI ?? SPOTIFY_REDIRECT_URI,
  };
}

export function isSpotifyConfigured(): boolean {
  const { clientId, clientSecret } = spotifyConfig();
  return !!clientId && !!clientSecret;
}

export function buildSpotifyAuthUrl(state: string): string {
  const { clientId, redirectUri } = spotifyConfig();
  return `${AUTH_URL}?${new URLSearchParams({
    client_id: clientId!,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
  })}`;
}

function basicAuth(): string {
  const { clientId, clientSecret } = spotifyConfig();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export async function exchangeSpotifyCode(code: string) {
  const { redirectUri } = spotifyConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error(`Spotify token exchange failed: ${res.status}`);
  return (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; scope?: string };
}

export async function getSpotifyToken(): Promise<string | null> {
  const auth = await db.spotifyAuth.findUnique({ where: { id: "singleton" } });
  if (!auth) return null;
  if (auth.expiresAt.getTime() - 60_000 > Date.now()) return auth.accessToken;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: auth.refreshToken }),
  });
  if (!res.ok) {
    // Access revoked — forget it so the UI offers a reconnect instead of failing forever.
    await db.spotifyAuth.deleteMany({ where: { id: "singleton" } });
    return null;
  }
  const data = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  await db.spotifyAuth.update({
    where: { id: "singleton" },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      // Spotify may rotate the refresh token; keep the new one if it does.
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
    },
  });
  return data.access_token;
}

export async function fetchDisplayName(token: string): Promise<string | null> {
  const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = (await res.json()) as { display_name?: string; id?: string };
  return data.display_name ?? data.id ?? null;
}

export type NowPlaying =
  | { state: "disconnected" }
  | { state: "idle" }
  | {
      state: "playing" | "paused";
      kind: "track" | "episode";
      spotifyId: string | null;
      title: string;
      artist: string;
      /** Every credited artist, for display; `artist` is the primary one. */
      artists: string;
      album: string | null;
      imageUrl: string | null;
      url: string | null;
      progressMs: number;
      durationMs: number;
      /** Server time the progress was read, so the client can interpolate. */
      fetchedAt: number;
    };

type RawPlaying = {
  is_playing?: boolean;
  progress_ms?: number | null;
  currently_playing_type?: string;
  item?: {
    id?: string;
    name?: string;
    duration_ms?: number;
    external_urls?: { spotify?: string };
    artists?: { name: string }[];
    album?: { name?: string; images?: { url: string; width?: number }[] };
    show?: { name?: string; images?: { url: string; width?: number }[] };
    images?: { url: string; width?: number }[];
  } | null;
};

/**
 * What's playing right now. An empty response (204) or a missing item both
 * mean nothing is playing — the docs don't pin down which Spotify sends, so
 * both are handled.
 */
export async function getNowPlaying(): Promise<NowPlaying> {
  const token = await getSpotifyToken();
  if (!token) return { state: "disconnected" };

  const res = await fetch(`${API}/me/player/currently-playing?additional_types=track,episode`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (res.status === 204 || res.status === 202) return { state: "idle" };
  if (res.status === 401) {
    await db.spotifyAuth.deleteMany({ where: { id: "singleton" } });
    return { state: "disconnected" };
  }
  if (!res.ok) return { state: "idle" };

  const text = await res.text();
  if (!text.trim()) return { state: "idle" };

  const data = JSON.parse(text) as RawPlaying;
  const item = data.item;
  if (!item?.name) return { state: "idle" };

  const isEpisode = data.currently_playing_type === "episode";
  const images = (isEpisode ? item.images ?? item.show?.images : item.album?.images) ?? [];
  // Smallest image that's still crisp at 2x for a ~40px thumbnail.
  const image = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0)).find((i) => (i.width ?? 0) >= 64) ?? images[0];

  return {
    state: data.is_playing ? "playing" : "paused",
    kind: isEpisode ? "episode" : "track",
    spotifyId: item.id ?? null,
    title: item.name,
    artist: isEpisode ? item.show?.name ?? "Podcast" : item.artists?.[0]?.name ?? "Unknown artist",
    artists: isEpisode ? item.show?.name ?? "Podcast" : (item.artists ?? []).map((a) => a.name).join(", "),
    album: isEpisode ? null : item.album?.name ?? null,
    imageUrl: image?.url ?? null,
    url: item.external_urls?.spotify ?? null,
    progressMs: data.progress_ms ?? 0,
    durationMs: item.duration_ms ?? 0,
    fetchedAt: Date.now(),
  };
}


/* ── Listening capture ──────────────────────────────────────────────────── */

export async function hasHistoryScope(): Promise<boolean> {
  const auth = await db.spotifyAuth.findUnique({ where: { id: "singleton" }, select: { scope: true } });
  return !!auth?.scope?.split(" ").includes(HISTORY_SCOPE);
}

/** Minimum gap between stored samples, so fast polling can't flood the table. */
const SAMPLE_EVERY_MS = 10_000;

/**
 * Store a now-playing reading if a study session is running. Called from the
 * now-playing route, which the widget polls — so a running timer quietly
 * builds up a record of what's playing.
 */
export async function recordSampleIfStudying(np: NowPlaying): Promise<void> {
  if (np.state !== "playing" && np.state !== "paused") return;
  const timer = await db.activeTimer.findUnique({ where: { id: "singleton" } });
  if (!timer) return;

  const last = await db.listeningSample.findFirst({ orderBy: { sampledAt: "desc" }, select: { sampledAt: true } });
  if (last && Date.now() - last.sampledAt.getTime() < SAMPLE_EVERY_MS) return;

  await db.listeningSample.create({
    data: {
      spotifyId: np.spotifyId,
      kind: np.kind,
      title: np.title,
      artist: np.artist,
      artists: np.artists,
      album: np.album,
      imageUrl: np.imageUrl,
      url: np.url,
      durationMs: np.durationMs,
      progressMs: np.progressMs,
      isPlaying: np.state === "playing",
    },
  });
}

type RawHistory = {
  items?: {
    played_at: string;
    track: {
      id?: string;
      name: string;
      duration_ms: number;
      external_urls?: { spotify?: string };
      artists?: { name: string }[];
      album?: { name?: string; images?: { url: string; width?: number }[] };
    };
  }[];
  next?: string | null;
};

/**
 * Tracks played since `since`, from Spotify's listening history. Pages
 * through up to `maxPages` × 50. Returns [] if the history permission hasn't
 * been granted, rather than failing the session that asked.
 */
export async function getHistorySince(since: Date, maxPages = 4) {
  const token = await getSpotifyToken();
  if (!token || !(await hasHistoryScope())) return [];

  const out: {
    spotifyId: string | null; title: string; artist: string; artists: string; album: string | null;
    imageUrl: string | null; url: string | null; durationMs: number; playedAt: Date;
  }[] = [];
  let url: string | null =
    `${API}/me/player/recently-played?limit=50&after=${since.getTime()}`;

  for (let page = 0; url && page < maxPages; page++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) break;
    const data = (await res.json()) as RawHistory;
    for (const it of data.items ?? []) {
      const t = it.track;
      const images = t.album?.images ?? [];
      const image = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0)).find((i) => (i.width ?? 0) >= 64) ?? images[0];
      out.push({
        spotifyId: t.id ?? null,
        title: t.name,
        artist: t.artists?.[0]?.name ?? "Unknown artist",
        artists: (t.artists ?? []).map((a) => a.name).join(", "),
        album: t.album?.name ?? null,
        imageUrl: image?.url ?? null,
        url: t.external_urls?.spotify ?? null,
        durationMs: t.duration_ms,
        playedAt: new Date(it.played_at),
      });
    }
    url = data.next ?? null;
  }
  return out;
}
