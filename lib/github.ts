import { db } from "./db";

/**
 * GitHub, read-only.
 *
 * Hand-rolled against the REST API, like Google and Spotify: a dozen GET
 * endpoints don't justify Octokit.
 *
 * Authentication is a personal access token, saved from Settings into
 * GitHubAuth (so it follows the stick), with GITHUB_TOKEN in .env as a
 * fallback for development. The project repos live in a university org that
 * can block OAuth apps; a classic token with `repo` scope is the one route
 * that always works.
 *
 * Every response is kept in GitHubCache with its ETag:
 *  - inside `maxAge` the cached copy is served without touching the network,
 *    so moving between tabs is instant;
 *  - after that the request is conditional - a 304 costs nothing against the
 *    rate limit and only refreshes the timestamp;
 *  - with no network, or GitHub down, the last answer is served and marked
 *    stale, so the GitHub tab shows what it knew rather than an error.
 */

const API = "https://api.github.com";
const TIMEOUT_MS = 6000;

export type GitHubErrorKind = "unauthorized" | "not-found" | "rate-limited" | "offline" | "unconfigured" | "other";

export class GitHubError extends Error {
  constructor(public kind: GitHubErrorKind, message: string, public status?: number) {
    super(message);
  }
}

/** What to tell the person, for each way a request can fail. */
export function describeGitHubError(e: unknown): string {
  if (!(e instanceof GitHubError)) return "Something went wrong talking to GitHub.";
  switch (e.kind) {
    case "unconfigured":
      return "Not connected to GitHub - add a token in Settings.";
    case "unauthorized":
      return "GitHub rejected the token. It may have expired or been revoked - replace it in Settings.";
    case "not-found":
      return "GitHub can't find that repo with this token. Check the name, and that the token can see private repos in its org.";
    case "rate-limited":
      return "GitHub's rate limit is used up for now. It resets within the hour.";
    case "offline":
      return "Couldn't reach GitHub - you may be offline.";
    default:
      return e.message;
  }
}

/* ── Token ───────────────────────────────────────────────────────────────── */

export type TokenSource = "settings" | "env";

export async function githubToken(): Promise<{ token: string; source: TokenSource } | null> {
  const row = await db.gitHubAuth.findUnique({ where: { id: "singleton" }, select: { token: true } });
  if (row) return { token: row.token, source: "settings" };
  const env = process.env.GITHUB_TOKEN?.trim();
  return env ? { token: env, source: "env" } : null;
}

export async function isGitHubConnected(): Promise<boolean> {
  return !!(await githubToken());
}

/* ── Requests ────────────────────────────────────────────────────────────── */

export type Fetched<T> = {
  data: T;
  fetchedAt: Date;
  /** True when this is an old copy served because GitHub couldn't be reached. */
  stale: boolean;
};

async function request(path: string, token: string, etag?: string | null): Promise<Response> {
  try {
    return await fetch(`${API}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(etag ? { "If-None-Match": etag } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GitHubError("offline", "Couldn't reach GitHub.");
  }
}

function failure(res: Response): GitHubError {
  if (res.status === 401) return new GitHubError("unauthorized", "Bad credentials", 401);
  if (res.status === 404) return new GitHubError("not-found", "Not found", 404);
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    return new GitHubError("rate-limited", "Rate limited", res.status);
  }
  if (res.status >= 500) return new GitHubError("offline", `GitHub returned ${res.status}`, res.status);
  return new GitHubError("other", `GitHub returned ${res.status}`, res.status);
}

/** Requests in flight, so two components asking for the same thing share one. */
const inflight = new Map<string, Promise<Fetched<unknown>>>();

/**
 * GET a GitHub API path, through the cache.
 *
 * `maxAge` is how long a cached answer is trusted without asking again;
 * `0` always asks (conditionally), which is what the Refresh button does.
 */
export async function gh<T>(path: string, { maxAge = 60 }: { maxAge?: number } = {}): Promise<Fetched<T>> {
  const key = path;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<Fetched<T>>;

  const run = (async (): Promise<Fetched<T>> => {
    const auth = await githubToken();
    if (!auth) throw new GitHubError("unconfigured", "No GitHub token.");

    const cached = await db.gitHubCache.findUnique({ where: { key } });
    const fromCache = (stale: boolean): Fetched<T> => ({
      data: JSON.parse(cached!.body) as T,
      fetchedAt: cached!.fetchedAt,
      stale,
    });
    if (cached && Date.now() - cached.fetchedAt.getTime() < maxAge * 1000) return fromCache(false);

    let res: Response;
    try {
      res = await request(path, auth.token, cached?.etag);
    } catch (e) {
      if (cached) return fromCache(true);
      throw e;
    }

    if (res.status === 304 && cached) {
      const fetchedAt = new Date();
      await db.gitHubCache.update({ where: { key }, data: { fetchedAt } });
      return { data: JSON.parse(cached.body) as T, fetchedAt, stale: false };
    }
    if (!res.ok) {
      const err = failure(res);
      // A dead token or a missing repo is news; a blip is not.
      if (cached && (err.kind === "offline" || err.kind === "rate-limited")) return fromCache(true);
      throw err;
    }

    const body = await res.text();
    const fetchedAt = new Date();
    const etag = res.headers.get("etag");
    await db.gitHubCache.upsert({
      where: { key },
      create: { key, etag, body, fetchedAt },
      update: { etag, body, fetchedAt },
    });
    return { data: JSON.parse(body) as T, fetchedAt, stale: false };
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

/**
 * Every page of a list endpoint, up to `maxPages` of 100. Pages are cached
 * individually, so a repo with one new issue re-downloads one page, and the
 * rest come back as 304s.
 */
export async function ghAll<T>(path: string, { maxAge = 60, maxPages = 5 }: { maxAge?: number; maxPages?: number } = {}): Promise<Fetched<T[]>> {
  const sep = path.includes("?") ? "&" : "?";
  const out: T[] = [];
  let oldest: Date | null = null;
  let stale = false;
  for (let page = 1; page <= maxPages; page++) {
    const r = await gh<T[]>(`${path}${sep}per_page=100&page=${page}`, { maxAge });
    out.push(...r.data);
    stale ||= r.stale;
    if (!oldest || r.fetchedAt < oldest) oldest = r.fetchedAt;
    if (r.data.length < 100) break;
  }
  return { data: out, fetchedAt: oldest ?? new Date(), stale };
}

/** Check a token before saving it: who it belongs to and what it can do. */
export async function verifyToken(token: string): Promise<{ login: string; name: string | null; scopes: string | null }> {
  const res = await request("/user", token);
  if (!res.ok) throw failure(res);
  const user = (await res.json()) as { login: string; name: string | null };
  return { login: user.login, name: user.name, scopes: res.headers.get("x-oauth-scopes") };
}

/** Throw away every cached answer - after the token changes, they may be someone else's view. */
export async function clearGitHubCache(): Promise<void> {
  await db.gitHubCache.deleteMany({});
}
