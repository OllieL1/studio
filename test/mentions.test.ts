/** @ mentions: the stored form, what they point at, and renaming a tag. */
import assert from "node:assert/strict";
import {
  extractMentions, linkDomain, linkFallbackLabel, isHttpUrl, mentionHref,
  mentions, renameTagMentions, serializeMention, stripMentions,
} from "../lib/mentions";

const tests: [string, () => void][] = [];
const test = (n: string, f: () => void) => tests.push([n, f]);

test("a mention round-trips through its stored form", () => {
  const token = serializeMention("paper", "hu2021lora", "LoRA");
  assert.equal(token, "@r[hu2021lora|LoRA]");
  assert.deepEqual(extractMentions(token), [{ kind: "paper", id: "hu2021lora", label: "LoRA" }]);
});

test("a label the same as the id isn't stored twice", () => {
  assert.equal(serializeMention("tag", "peft", "peft"), "@#[peft]");
  assert.equal(extractMentions("@#[peft]")[0].label, "peft");
});

test("brackets and pipes can't break the token", () => {
  const t = serializeMention("note", "abc", "Weird ]|[ title");
  assert.equal(extractMentions(t).length, 1);
  assert.equal(extractMentions(t)[0].label, "Weird  title");
});

test("every kind is recognised", () => {
  const md = "@r[key] @#[tag] @t[t1|Task] @n[n1|Note] @m[m1|Meeting] @u[https://a.b|Site]";
  assert.deepEqual(extractMentions(md).map((m) => m.kind),
    ["paper", "tag", "task", "note", "meeting", "link"]);
});

test("ordinary text with an @ in it is left alone", () => {
  assert.deepEqual(extractMentions("email me @ ollie, or @notanote"), []);
  assert.deepEqual(extractMentions("@r[]"), []);
});

test("mentions are found among prose", () => {
  const md = "Compare @r[hu2021lora|LoRA] against the survey, tagged @#[peft].";
  assert.ok(mentions(md, "paper", "hu2021lora"));
  assert.ok(mentions(md, "tag", "PEFT"), "tag matching ignores case");
  assert.ok(!mentions(md, "paper", "vaswani2017"));
});

test("each kind links somewhere sensible", () => {
  assert.equal(mentionHref("tag", "PEFT"), "/project/tags/peft");
  assert.equal(mentionHref("note", "n1"), "/project/nexus/n1");
  assert.equal(mentionHref("task", "t1"), "/tasks/t1");
  assert.equal(mentionHref("meeting", "m1"), "/project/meetings/m1");
  assert.match(mentionHref("paper", "hu2021lora"), /tab=research&paper=hu2021lora/);
  assert.equal(mentionHref("link", "https://example.com"), "https://example.com");
});

test("stripping leaves readable text for excerpts", () => {
  const md = "See @r[hu2021lora|LoRA] and @#[peft] and @u[https://a.b|Site].";
  assert.equal(stripMentions(md), "See LoRA and #peft and Site.");
});

test("renaming a tag rewrites its mentions and nothing else", () => {
  const md = "@#[peft] and @#[eval] and @r[peft|A paper]";
  const out = renameTagMentions(md, "PEFT", "Fine-tuning");
  assert.equal(out, "@#[Fine-tuning] and @#[eval] and @r[peft|A paper]");
});

test("link chips know their domain, and a fallback label", () => {
  assert.equal(linkDomain("https://www.arxiv.org/abs/123"), "arxiv.org");
  assert.equal(linkFallbackLabel("https://arxiv.org/abs/123"), "arxiv.org/abs/123");
  assert.equal(linkFallbackLabel("https://arxiv.org/"), "arxiv.org");
  assert.ok(isHttpUrl("https://a.b/c") && !isHttpUrl("not a url"));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failed++; console.log(`  \x1b[31m✗\x1b[0m ${name}\n    ${(e as Error).message}`); }
}
console.log(`\n  ${tests.length - failed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
