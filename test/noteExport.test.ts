/** Purpose: pins what a downloaded markdown note contains and is called. */
import assert from "node:assert/strict";
import { fileSlug, noteMarkdown } from "../lib/noteExport";

assert.equal(noteMarkdown("Reading", "Some **bold** text.\n\n"), "# Reading\n\nSome **bold** text.\n");
assert.equal(noteMarkdown("T", "See @r[hu2021lora|LoRA] and @#[agents]."), "# T\n\nSee LoRA and #agents.\n");
assert.equal(
  noteMarkdown("T", "@u[https://example.com/a|The docs] @u[https://example.com/b]"),
  "# T\n\n[The docs](https://example.com/a) <https://example.com/b>\n",
);
assert.equal(fileSlug("RMT: Lit review (draft 2)"), "rmt-lit-review-draft-2");

console.log("note export: 4 checks passed");
