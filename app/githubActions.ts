"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { clearGitHubCache, describeGitHubError, gh, GitHubError, verifyToken } from "@/lib/github";
import { findIssue, projectRepo, repoOverview, syncLinkedIssues } from "@/lib/githubData";
import { parseRepo, repoUrl } from "@/lib/repos";

/**
 * GitHub mutations. Studio never writes to GitHub - everything here changes
 * Studio's own records: the token, the Repos menu, and task-issue links.
 */

function refresh() {
  revalidatePath("/", "layout");
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/* ── Token ───────────────────────────────────────────────────────────────── */

export async function saveGitHubToken(raw: string): Promise<Result<{ login: string }>> {
  const token = raw.trim();
  if (!token) return { ok: false, error: "Paste a token first." };
  if (/\s/.test(token)) return { ok: false, error: "That has spaces in it - a token is one unbroken string." };
  let who: Awaited<ReturnType<typeof verifyToken>>;
  try {
    who = await verifyToken(token);
  } catch (e) {
    return { ok: false, error: e instanceof GitHubError && e.kind === "unauthorized" ? "GitHub doesn't recognise that token." : describeGitHubError(e) };
  }
  await db.gitHubAuth.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", token, login: who.login, name: who.name, scopes: who.scopes },
    update: { token, login: who.login, name: who.name, scopes: who.scopes },
  });
  // Cached answers were fetched as whoever the old token was.
  await clearGitHubCache();
  refresh();
  return { ok: true, login: who.login };
}

export async function disconnectGitHub(): Promise<Result> {
  await db.gitHubAuth.deleteMany({});
  await clearGitHubCache();
  refresh();
  return { ok: true };
}

/** Can the token see this repo? Used by Settings to check each one. */
export async function checkRepoAccess(fullName: string): Promise<Result> {
  try {
    await gh(`/repos/${fullName}`, { maxAge: 300 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeGitHubError(e) };
  }
}

/* ── The Repos menu ──────────────────────────────────────────────────────── */

/** The project's own repo - first in the menu, and the one the GitHub tab shows. Blank clears it. */
export async function setProjectRepo(input: string): Promise<Result> {
  const course = await db.course.findFirst({ where: { isProject: true }, select: { id: true } });
  if (!course) return { ok: false, error: "No project course found." };
  const fullName = input.trim() ? parseRepo(input) : null;
  if (input.trim() && !fullName) return { ok: false, error: "Paste a GitHub link or owner/name for the project repo." };
  await db.course.update({ where: { id: course.id }, data: { repoUrl: fullName ? repoUrl(fullName) : null } });
  refresh();
  return { ok: true };
}

export async function addRepo(input: string, label: string): Promise<Result> {
  const fullName = parseRepo(input);
  if (!fullName) return { ok: false, error: "Paste a GitHub link or owner/name." };
  const project = await projectRepo();
  if (project && project.toLowerCase() === fullName.toLowerCase()) return { ok: false, error: "That's the project repo - it's already first in the menu." };
  const existing = await db.repo.findMany({ select: { fullName: true, position: true } });
  if (existing.some((r) => r.fullName.toLowerCase() === fullName.toLowerCase())) return { ok: false, error: "Already in the menu." };
  await db.repo.create({
    data: {
      fullName,
      label: label.trim() || fullName.split("/")[1],
      position: Math.max(-1, ...existing.map((r) => r.position)) + 1,
    },
  });
  refresh();
  return { ok: true };
}

export async function renameRepo(id: string, label: string): Promise<Result> {
  const clean = label.trim();
  if (!clean) return { ok: false, error: "A repo needs a name in the menu." };
  await db.repo.update({ where: { id }, data: { label: clean.slice(0, 40) } });
  refresh();
  return { ok: true };
}

export async function removeRepo(id: string): Promise<Result> {
  await db.repo.deleteMany({ where: { id } });
  refresh();
  return { ok: true };
}

/** Swap a repo with its neighbour. Positions are rewritten 0..n so gaps never accumulate. */
export async function moveRepo(id: string, direction: -1 | 1): Promise<Result> {
  const repos = await db.repo.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  const i = repos.findIndex((r) => r.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= repos.length) return { ok: true };
  [repos[i], repos[j]] = [repos[j], repos[i]];
  await db.$transaction(repos.map((r, position) => db.repo.update({ where: { id: r.id }, data: { position } })));
  refresh();
  return { ok: true };
}

/* ── Issues and tasks ────────────────────────────────────────────────────── */

/** Link a project-repo issue to a task. Linking never ticks the task, even if the issue is already closed. */
export async function linkIssue(taskId: string, number: number): Promise<Result> {
  const repo = await projectRepo();
  if (!repo) return { ok: false, error: "Set the project's repo in Settings first." };
  let issue;
  try {
    issue = await findIssue(repo, number);
  } catch (e) {
    return { ok: false, error: describeGitHubError(e) };
  }
  if (!issue) return { ok: false, error: `There's no issue #${number} in ${repo}.` };
  await db.taskIssue.upsert({
    where: { taskId_repo_number: { taskId, repo, number } },
    create: { taskId, repo, number, title: issue.title, state: issue.state, closedAt: issue.closedAt ? new Date(issue.closedAt) : null },
    update: { title: issue.title, state: issue.state, closedAt: issue.closedAt ? new Date(issue.closedAt) : null },
  });
  refresh();
  return { ok: true };
}

export async function unlinkIssue(taskId: string, repo: string, number: number): Promise<Result> {
  await db.taskIssue.deleteMany({ where: { taskId, repo, number } });
  refresh();
  return { ok: true };
}

/** A project task made from an issue, linked to it. */
export async function createTaskFromIssue(number: number): Promise<Result<{ taskId: string }>> {
  const repo = await projectRepo();
  const course = await db.course.findFirst({ where: { isProject: true }, select: { id: true } });
  if (!repo || !course) return { ok: false, error: "Set the project's repo in Settings first." };
  let issue;
  try {
    issue = await findIssue(repo, number);
  } catch (e) {
    return { ok: false, error: describeGitHubError(e) };
  }
  if (!issue) return { ok: false, error: `There's no issue #${number} in ${repo}.` };

  const task = await db.task.create({
    data: {
      title: issue.title,
      kind: "OTHER",
      courseId: course.id,
      issues: {
        create: { repo, number, title: issue.title, state: issue.state, closedAt: issue.closedAt ? new Date(issue.closedAt) : null },
      },
    },
  });
  refresh();
  return { ok: true, taskId: task.id };
}

/**
 * Re-check a task's issues against GitHub. The task page calls this once it
 * has rendered, so the page never waits on the network; it refreshes only if
 * something changed.
 */
export async function refreshTaskIssues(taskId: string): Promise<{ changed: boolean }> {
  const repos = (await db.taskIssue.findMany({ where: { taskId }, distinct: ["repo"], select: { repo: true } })).map((r) => r.repo);
  if (repos.length === 0) return { changed: false };
  const res = await syncLinkedIssues({ maxAge: 60, repos });
  if (res.changed) refresh();
  return res;
}

/** The Refresh button on the GitHub tab: ask GitHub now rather than trusting the cache. */
export async function refreshProjectRepo(): Promise<Result> {
  const repo = await projectRepo();
  if (!repo) return { ok: false, error: "No project repo linked." };
  try {
    await repoOverview(repo, { maxAge: 0 });
  } catch (e) {
    return { ok: false, error: describeGitHubError(e) };
  }
  refresh();
  return { ok: true };
}
