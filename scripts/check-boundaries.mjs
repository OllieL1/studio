/**
 * Guards against a bug class the build doesn't catch: a server component
 * *calling* a function exported from a "use client" module. It compiles, then
 * throws at runtime ("Attempted to call X() from the server") — which is how
 * the stats page 500'd on 18 Sep 2026. Rendering client *components* from the
 * server is fine; calling lowercase functions is not.
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

if (problems.length) {
  console.log(`  \x1b[31m✗\x1b[0m server components calling client-only functions:`);
  for (const p of problems) console.log(`    \x1b[31m${p}\x1b[0m`);
  console.log(`\n  0 passed, ${problems.length} failed\n`);
  process.exit(1);
}
console.log(`  \x1b[32m✓\x1b[0m no server component calls a client-only function\n\n  1 passed, 0 failed\n`);
