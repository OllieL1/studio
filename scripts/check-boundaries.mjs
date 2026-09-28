/**
 * Guards two bug classes the build doesn't catch.
 *
 * One: a server component *calling* a function exported from a "use client"
 * module. It compiles, then throws at runtime ("Attempted to call X() from the
 * server") — which is how the stats page 500'd on 18 Sep 2026. Rendering
 * client *components* from the server is fine; calling lowercase functions is
 * not.
 *
 * Two: the reverse — a "use client" module reaching lib/db.ts, directly or
 * through a helper. Prisma then gets bundled for the browser and every page
 * logs "PrismaClient is unable to run in this browser environment", which is
 * how the tag picker broke on 28 Sep 2026 by importing one pure function from
 * a module that also talked to the database.
 *
 *   node scripts/check-boundaries.mjs      (also runs as part of npm test)
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, normalize } from "node:path";

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });

const isClient = (p) => readFileSync(p, "utf8").trimStart().startsWith('"use client"');
const resolve = (spec, from) => {
  const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? normalize(join(dirname(from), spec)) : null;
  if (!base) return null;
  return [".tsx", ".ts", "/index.tsx", "/index.ts"].map((e) => base + e).find(existsSync) ?? null;
};

const problems = [];
for (const file of ["app", "components", "lib"].flatMap(walk)) {
  if (isClient(file)) continue;
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
    if (m[1]) continue; // type-only imports are erased at compile time
    const target = resolve(m[3], file);
    if (!target || !isClient(target)) continue;
    for (const raw of m[2].split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop();
      if (name && !name.startsWith("type ") && /^[a-z]/.test(name)) {
        problems.push(`${file} imports ${name}() from client module ${target}`);
      }
    }
  }
}

// ── Client code must never reach the database ───────────────────────────────
const DB = normalize("lib/db.ts");
const reaches = new Map(); // file -> import chain to lib/db.ts, or null

function chainToDb(file, seen = new Set()) {
  if (normalize(file) === DB) return [file];
  if (seen.has(file)) return null;
  seen.add(file);
  if (reaches.has(file)) return reaches.get(file);

  const src = readFileSync(file, "utf8");
  // A server action is a boundary, not a leak: it runs on the server and the
  // client only gets a stub.
  if (src.trimStart().startsWith('"use server"')) return null;

  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+"([^"]+)"/g)) {
    if (m[1]) continue;
    const target = resolve(m[2], file);
    if (!target) continue;
    const rest = chainToDb(target, seen);
    if (rest) {
      const chain = [file, ...rest];
      reaches.set(file, chain);
      return chain;
    }
  }
  reaches.set(file, null);
  return null;
}

for (const file of ["app", "components", "lib"].flatMap(walk)) {
  if (!isClient(file)) continue;
  const chain = chainToDb(file);
  if (chain) problems.push(`${file} pulls the database into the browser: ${chain.join(" → ")}`);
}

if (problems.length) {
  console.log(`  \x1b[31m✗\x1b[0m boundary violations:`);
  for (const p of problems) console.log(`    \x1b[31m${p}\x1b[0m`);
  console.log(`\n  0 passed, ${problems.length} failed\n`);
  process.exit(1);
}
console.log(
  `  \x1b[32m✓\x1b[0m no server component calls a client-only function\n` +
    `  \x1b[32m✓\x1b[0m no client module reaches the database\n\n  2 passed, 0 failed\n`,
);
