# Study Planner — 26/27

My uni time management portal for fifth year.

```bash
npm install
npm run seed     # populate courses & timetable from claude/SUBJECTS.md
npm run dev      # → http://localhost:3000
```

---

## What it does

| | |
|---|---|
| **Home** | Overall progress, per-course progress, today's classes and deadlines, headline metrics, and a one-line task composer. |
| **Stats** | Daily averages, best/worst hours and weekdays, focus trends and distribution, per-subject breakdown. |
| **Sessions** | Full session history by day, plus manual logging for study done away from the laptop. |
| **Lectures** | Every lecture, filterable by course and by what's missing. Typed notes, handwritten notebook references, PDF export. |
| **Course** | Weighted breakdown, exam readiness, revision mode, assessed work and classes by teaching week. |
| **Settings** | Google Calendar connection and semester-2 status. |
| **Timer** | Always-visible global on/off control, pinned bottom-centre on every page. |
| **⌘K** | Global search across courses, lectures, tasks and the full text of your notes. |

---

## The timer

The start time lives in the database, not the browser. Closing the tab,
reloading or crashing loses nothing — the elapsed figure is always derived
from the stored start time, so it can't drift either. The running time also
shows in the tab title.

Stopping asks for a name, subject(s), optional task link(s), a **downward-only**
duration adjustment and a focus rating out of 100. The adjustment is clamped
server-side, so a stale form can never inflate a session. Every statistic uses
the adjusted figure, and the stats page tells you how much you've trimmed in total.

### Splitting a session between subjects

Pick two or more subjects and a split control appears, with three modes:

| Mode | You give | Notes |
|---|---|---|
| **Equal** | nothing | Even share, the default |
| **Percent** | a % per subject | Proportional — needn't add to exactly 100 |
| **Time** | minutes per subject | Scaled to fit if they don't add up |

Whichever you choose, the resolved minutes are shown live per subject and the
**slices always sum to exactly the session total** — apportioned by
largest-remainder rounding, so 50m across 3 subjects is 17+17+16, never 51.
The server re-derives the slices from their ratios on save, so a stale form
can't invent or lose time. Session history shows each subject's slice.

---

## How progress is calculated

Each course has three weights summing to 100 — **lecture / lab / assessment** —
tunable per course from the course page.

**Exams are deliberately excluded.** An exam resolves in one moment at the very
end of the year; counting it would peg every bar low for months and then jump.
Instead each exam gets a **readiness card** showing its diet and how much of its
prerequisite lecture chain is done.

**Absent categories rescale.** Most courses have no labs, so their lab weight is
redistributed across the remaining categories rather than showing an empty bar.

Within a category, a task counts as the fraction of its checklist ticked — a
lecture with 2 of 3 parts done is ⅔ complete. Assessments are then combined
weighted by real grade weight where known, equal-weighted where not.

**Subtasks are equally weighted within their task.** Coursework starts with an
empty checklist — expand any row and type to break it down. Four subtasks make
each worth 25%; adding a fifth re-weights them to 20% each. Lectures and labs
come with their canonical parts and can take extras too.

Dependencies (an exam depending on all its lectures) are **advisory only**.
Nothing is ever blocked from being ticked early.

### Worked example — Functional Programming (30 / 20 / 50)

| Action | Course progress |
|---|---|
| Nothing ticked | 0.0% |
| All 20 lectures done | 30.0% |
| + all 10 labs | 50.0% |
| + Programming Exercise (20% of grade) | 75.0% |
| + exam ticked | **75.0%** — unchanged, by design |

---

## Lecture notes

Each lecture has a markdown editor with live preview, autosave, and an outline
built from its headings. Code is syntax-highlighted in the design system's own
palette; GFM tables and task lists work. Pasted HTML is sanitised.

**Export** is the browser's own print engine over a print stylesheet — not a JS
PDF library. That gives proper hyphenation, page-breaking and link footnoting,
and adds no dependency to keep alive.

| | |
|---|---|
| One lecture | `/lectures/[id]` → **Export PDF** |
| A whole course | `/lectures?course=…` → **Export all notes** |

The course export opens with a title page and a contents list (lecture titles
plus their `##` subheadings), then one lecture per page in teaching order.
Headings avoid orphan breaks; code blocks and tables never split across pages.

**Handwritten notes** get a notebook (Space / Physics / Computing — the cover
designs, not the contents) and a page range, editable inline and searchable.

---

## Revision mode

Per course, from the course page. Adds an unticked **Revised** step to every
lecture — attendance and typed/handwritten notes stay ticked, because they
genuinely happened. The lecture drops from 3/3 to 3/4, so the course re-opens
at ~75% and you work back through it for the exam.

No unticking by hand, no duplicate revision tasks. Turning it off removes the
step and restores every lecture exactly. Idempotent in both directions.

---

## Google Calendar

One click on any dated task creates the event; clicking again **updates** that
event rather than duplicating it. Tasks with a time get a one-hour slot ending
at the deadline; date-only tasks become all-day events.

**It needs credentials before it does anything.** Six steps, roughly five
minutes, written out in the app at `/settings` — create a Google Cloud project,
enable the Calendar API, make an OAuth client with redirect URI
`http://localhost:3000/api/google/callback`, and put the ID and secret in `.env`:

```
GOOGLE_CLIENT_ID="….apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="…"
```

Tokens are stored in the database and refreshed automatically. If the refresh
token is revoked, the connection drops and the UI prompts a reconnect rather
than failing silently. Written against the REST API directly — three endpoints
didn't justify pulling in `googleapis`.

---

## Semesters

Courses carry a `semester` (1, 2, or 3 = all year). **Semester-2 courses are
hidden from every page until 1 January 2027** — they're seeded now so the shells
exist, but showing them through autumn would just be noise. Coaching Software
Teams is marked full-year and stays visible throughout.

The reveal date is `SEMESTER_2_VISIBLE_FROM` in `lib/types.ts`.

---

## Adding tasks

One line, parsed live, with every recognised token echoed back as a chip.
Press <kbd>/</kbd> anywhere to jump to the composer.

```
FP programming exercise fri 5pm ! 20%
 │            │           │   │  │  └─ grade weight
 │            │           │   │  └──── priority
 │            │           │   └─────── time
 │            │           └─────────── date
 │            └─────────────────────── title
 └──────────────────────────────────── course
```

Dates understand `today`, `tomorrow`, `fri`, `next mon`, `24/11`, `19 oct`,
`2026-11-20` and `in 3d` / `in 2 weeks`. A month already past rolls to next
year, so in September `8 mar` means March 2027.

Task type is inferred from words like `lab`, `essay`, `quiz` but **stays in the
title** — `coursework 40%` becomes a task actually called "coursework". Prefix
with `#` (`#lab 3`) to consume the word instead.

---

## Data

SQLite via Prisma, one file at `prisma/dev.db`. Nothing lives in localStorage.

```bash
npm run backup      # timestamped copy into backups/ (keeps the last 20)
npm run db:studio   # browse/edit the data directly
```

The schema avoids anything SQLite-specific — enums are strings backed by unions
in `lib/types.ts` — so moving to Postgres later is a `provider` and
`DATABASE_URL` change plus a migration, not a rewrite.

`npm run seed` is **idempotent**: courses are upserted by code and a task is only
created if one with that title doesn't already exist. Re-running it never
destroys completion state, sessions or tasks you added yourself.

---

## Commands

| | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build & serve |
| `npm test` | Progress, parser, split, subtask, revision and markdown tests (93) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Populate/refresh courses and timetable |
| `npm run backup` | Snapshot the database |
| `npm run demo` / `demo:clear` | Add or remove sample sessions to preview the stats page |

---

## Layout

```
app/
  page.tsx            home
  lectures/           notes, filters, per-lecture pages + print
  settings/           Google Calendar, semester status
  stats/              analytics
  sessions/           history + manual logging
  courses/[id]/       course detail
  actions.ts          every mutation (server actions)
  api/tasks/          task lookup for the timer & dependency pickers
lib/
  progress.ts         the weighting rules — start here
  split.ts            per-subject time apportionment
  tasks.ts            completion, subtasks & revision mode (kept testable)
  markdown.ts         note rendering, TOC, sanitisation
  google.ts           Calendar OAuth + event sync
  stats.ts            analytics aggregation
  parse.ts            one-line task parser
  queries.ts          data fetching
components/
  TimerBar · StopDialog · SubjectSplit · QuickAdd · TaskRow
  CommandPalette · NotesEditor · LectureBrowser · RevisionToggle · charts/
prisma/
  schema.prisma       data model
  seed.ts             courses & timetable, transcribed from claude/SUBJECTS.md
test/                 progress + parser tests
```

Design system — palette, type, motion, chart conventions — is in
[`DESIGN.md`](./DESIGN.md). The brief and the agreed clarifications are in
[`claude/AIM.md`](./claude/AIM.md).
