/**
 * Repo names and GitHub URLs. Pure, so client components can use them
 * without pulling in the database (lib/github.ts).
 */

/**
 * "owner/name" from whatever was pasted: a full URL (with or without
 * .git, a trailing path, or a fragment), an SSH remote, or the bare name.
 * Null when it doesn't look like a repo.
 */
export function parseRepo(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const m =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i.exec(s) ??
    /^git@github\.com:([\w.-]+)\/([\w.-]+)$/i.exec(s) ??
    /^([\w.-]+)\/([\w.-]+)$/.exec(s);
  if (!m) return null;
  const name = m[2].replace(/\.git$/, "");
  // "." and ".." match the character class but aren't names - and would
  // walk up the API path.
  if (!name || /^\.+$/.test(m[1]) || /^\.+$/.test(name)) return null;
  return `${m[1]}/${name}`;
}

export const repoUrl = (fullName: string) => `https://github.com/${fullName}`;
export const issueUrl = (fullName: string, number: number) => `https://github.com/${fullName}/issues/${number}`;
