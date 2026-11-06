---
name: enhancements
description: Work through Studio's enhancement queue - the bugs, features and tweaks Ollie noted in the app with ⌥Q (Settings → Enhancements). Use when the user says "/enhancements", "work through the queue", "do the enhancements", or asks what's queued.
---

# Working the enhancement queue

The queue replaces `claude/ENHANCEMENTS.md` (now an archive - read it for the
history and the tone of past write-ups). Items are added in the running app,
so they live in the **stick's** database. You read a copy of it; you never
write to the stick. What you did goes in `claude/queue/resolved.json`, and the
next `npm run usb:deploy` applies it, so an item shows as done in Settings
once its fix is actually on the stick.

## 1. Read the queue

```bash
npm run queue            # queued items, top-down, as markdown (stick, else prisma/dev.db)
npm run queue -- --all   # include closed items, for context
```

The first line says where it read from. If it fell back to `prisma/dev.db`
because the stick isn't plugged in, say so - the list may be stale.

Work **top-down**: the order is Ollie's priority. Each item names the page it
was noted on (`studio /lectures/12`) - start there. Items under "Waiting on an
answer" are blocked on Ollie; skip them unless he's answered in chat.

Before starting, show the list back in a few lines (number, kind, title) and
your intended order, and flag anything ambiguous. Proceed unless something
genuinely needs his decision.

## 2. For each item

1. Implement it. Follow `AGENTS.md` (this Next.js differs from training data -
   read `node_modules/next/dist/docs/` for anything unfamiliar) and match the
   surrounding code's style and comments.
2. `npm run typecheck` and `npm test` (add or extend a test where the logic is
   testable). Run the app (`npm run dev`) to check UI changes where you can.
3. Record what you did - a short write-up in the voice of the old
   `## Status` sections: what was wrong / what changed, how to use it, any
   caveat. Plain text, a few sentences; it's shown in Settings.

   ```bash
   npm run queue -- resolve 14 --status done --note "…"
   npm run queue -- resolve 14 --status done --note-file /path/to/note.md   # longer ones
   ```

   - `done` - fixed or built.
   - `question` - you need Ollie's input (couldn't reproduce, two reasonable
     designs, missing detail). The note **is** the question; ask one clear
     thing. He answers in Settings and it comes back to the top of the queue.
   - `wontfix` - only when he's agreed in chat, or it's already done/obsolete;
     say why.
4. Commit the change **with** `claude/queue/resolved.json`, one commit per
   item, message starting `#14: …`. Commit on a branch, not `main`
   (`pr/enhancements-<date>` unless one exists).

Partially done? Resolve as `question` explaining what's left, or leave it
unresolved and say so - never mark `done` on something that isn't.

## 3. Finish

Summarise in chat: per item, the number, title and outcome (one line each),
plus any questions you queued. Then **ask** before each of:

- pushing the branch / opening a PR, and
- `npm run usb:deploy` - which flashes the stick and applies the resolutions.
  Studio must be closed on the stick first.

`npm run queue -- pending` lists resolutions not yet deployed.
