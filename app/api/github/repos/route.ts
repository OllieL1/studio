import { NextResponse } from "next/server";
import { isGitHubConnected } from "@/lib/github";
import { repoMenu, repoPulse } from "@/lib/githubData";

export const dynamic = "force-dynamic";

/**
 * Open issues, open PRs and last push for every repo in the nav's Repos menu.
 * Fetched when the menu opens, never on page load, and cached for five
 * minutes - so it's two conditional requests per repo at most.
 */
export async function GET() {
  if (!(await isGitHubConnected())) return NextResponse.json({ connected: false, repos: [] });
  const repos = await repoMenu();
  const pulses = await Promise.all(repos.map((r) => repoPulse(r.fullName)));
  return NextResponse.json({ connected: true, repos: pulses });
}
