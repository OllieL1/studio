# Studio — 26/27

*Stud(y) + IO.* My fifth-year study planner.

My uni time management portal for fifth year.

**Day to day, Studio runs from the USB stick** - plug it in and double-click
`Start Studio.command` (Mac) or `Start Studio.bat` (Windows). See
[Running from the USB stick](#running-from-the-usb-stick).

For development:

```bash
npm install
npm run seed     # populate courses & timetable from claude/SUBJECTS.md
npm run dev      # → http://localhost:3111  (shows a "Dev copy" badge)
```

---

## What it does

| | |
|---|---|
| **Home** | Overall progress, per-course progress, today's classes and deadlines, headline metrics, and a one-line task composer. |
| **Stats** | Daily averages, best/worst hours and weekdays, focus trends and distribution, per-subject breakdown. |
| **Sessions** | Full session history by day, plus manual logging for study done away from the laptop. |
| **Calendar** | Month and week views: Google events, deadlines, exams, lectures, labs and uni events. Big deadlines blocked out. |
| **Task** | Full view of one task: details (all editable), subtasks, prerequisites, time tracked and work history. |
| **Lectures** | Every lecture, filterable by course and by what's missing. Typed notes, handwritten notebook references, PDF export. |
| **Course** | Weighted breakdown, exam readiness, revision mode, assessed work and classes by teaching week. |
| **Settings** | Google Calendar, Spotify and GitHub connections, the Repos menu, semester-2 status. |
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
`http://localhost:3111/api/google/callback`, and put the ID and secret in `.env`:

```
GOOGLE_CLIENT_ID="….apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="…"
```

Tokens are stored in the database and refreshed automatically. If the refresh
token is revoked, the connection drops and the UI prompts a reconnect rather
than failing silently. Written against the REST API directly — three endpoints
didn't justify pulling in `googleapis`.

---

## Calendar

`/calendar` — month by default, week for real times. Keys: ← → page, **T** today,
**M**/**W** switch view, **N** new event.

| Shows | How |
|---|---|
| Deadlines | Chips; exams and coursework worth **15%+** are blocked out with a hatch |
| Lectures & labs | Coloured dots in month view, timed blocks in week view |
| Uni events | Outlined; created here, optionally synced to Google |
| Google events | Every calendar you have visible in Google, read-only |

Anything this app pushed to Google is filtered from the Google feed, so nothing
appears twice. Overlapping items in week view sit side by side
(`lib/calendar.ts` → `layoutDay`). All-day events store an exclusive end date,
matching Google — and step back by a *calendar day*, not 24 hours, so events on
the day the clocks change don't lose a day.

---

## GitHub

The project's repo gets its own tab (`/project` → **GitHub**): open and closed
issues with instant filtering, pull requests, a commits-per-week bar since the
project began, recent commits and an activity feed. **Read-only** - Studio never
changes anything on GitHub.

| | |
|---|---|
| **Issues → tasks** | **Make task** on an issue, or **Link…** it to an existing task; a task page links issues too. When the last open issue on a task closes, the task ticks itself. |
| **`@i` mentions** | In any live editor, `@i` searches the project repo's issues by title or number. Stored as `@i[owner/repo#12\|Title]`; renders as a chip that opens the issue, and prints in PDFs. |
| **Agenda drafts** | "Draft from recent work" adds an **On GitHub** section: commits, merged and opened PRs, closed and new issues since the last meeting. |
| **Repos menu** | Beside Courses in the nav (the GitHub mark next to search on narrower screens). The project repo first, then whatever's added in Settings, each with live PR/issue counts. |

**Auth is a personal access token**, pasted into Settings and stored in the
database so it travels with the stick. A classic token with the `repo` scope
reads your own repos. **The `uog-cose` org refuses classic tokens** (GitHub
says so in the 403, and Studio now shows that message) - its repos need a
fine-grained token with uog-cose as resource owner, which only reaches that one
owner. Settings walks through making one and checks each repo is readable. `GITHUB_TOKEN` in `.env` works too, for development.

**It stays fast and works offline.** Every response is cached in `GitHubCache`
with its ETag: inside a minute it's served without a request, after that the
request is conditional (a 304 is free against the rate limit), and with no
network the last answer is shown, labelled with its age. The tab streams in
behind a skeleton, so the rest of the project page never waits. The `@i` menu
searches a parsed copy held in memory - no request per keystroke.

**When does a task tick?** On the *transition*: an issue that was open the
last time Studio looked is now closed, and it was the task's last open one.
Linking an already-closed issue ticks nothing, and a task you untick stays
unticked. A reopened issue never unticks a task. The check runs after the home
and project pages have been sent, and when a task page opens.

## Spotify

What's playing sits beside the timer. Read-only — it can't control playback.

**Music is logged with every study session.** While the timer runs, each now-playing
poll is stored; when the session stops, those samples plus Spotify's listening
history (for stretches the app was closed) are folded into per-session tracks by
`lib/music.ts`. Listening time comes from how far playback *position* moved, so
pauses don't count, and skips are cut off where the next track begins.

The Stats page's Music section only uses sessions recorded **with capture on** — an
older session without music data is "unknown", not "silent", and counting it as
silent would skew music-vs-silence. Comparisons need 3+ sessions per side before
they show a difference.

Genres and audio features (tempo, energy, instrumentalness) aren't available:
Spotify blocked them for new apps in November 2024.

Needs a Spotify app (steps at `/settings`) and in `.env`:

```
SPOTIFY_CLIENT_ID="…"
SPOTIFY_CLIENT_SECRET="…"
```

Connections made before 18 Sep 2026 lack the listening-history permission; the app
prompts to reconnect.

Spotify **rejects `localhost`** as a redirect URI, so register
`http://127.0.0.1:3111/api/spotify/callback`. The connect button bounces to
`127.0.0.1` first so the sign-in's security cookie lands on the right host.

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

## Running from the USB stick

The stick (`STUDIO`, FAT32 so both Mac and Windows can use it) carries a
production build of the site, Node for both machines, and **the live
database**. Nothing needs installing on either computer.

```
STUDIO/
  Start Studio.command     double-click on the Mac
  Start Studio.bat         double-click on Windows
  README.txt               how to use it, and what to do if it's lost
  studio/
    app/                   the built site
    runtime/               Node 22 for Mac (Apple Silicon) and Windows (x64)
    data/studio.db         the live data
    config.env             Google / Spotify credentials
    launcher.mjs           one launcher for both machines
```

The launcher checks nothing else is on port 3111, starts the server **bound
to 127.0.0.1 only** (nothing on the network can reach it), waits until it can
read the database, and opens the browser. The server runs inside the
launcher's own process, so closing the window always stops it - on Windows a
separate process would survive the window and keep the stick busy.

| | |
|---|---|
| `npm run usb:runtimes` | Download Node 22 for Mac + Windows, checksum-verified |
| `npm run usb:deploy` | Build and update the stick. Copies only changed files (by content hash). **Never overwrites the stick's database** - it copies data across only on the first deploy, then applies any new migrations |
| `npm run usb:pull` | Copy the stick's live data into `prisma/dev.db` for development |

**The stick is the live copy.** `npm run dev` runs against `prisma/dev.db`,
which is only a copy - the nav shows a "Dev copy" badge, and the stick's
launcher refuses to start while the dev server is running, so data can't end
up in the wrong place.

---

## Commands

| | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build & serve |
| `npm test` | All unit and integration tests, plus a server/client boundary check (367) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run seed` | Populate/refresh courses and timetable |
| `npm run backup` | Snapshot the local development database |
| `npm run demo` / `demo:clear` | Add or remove sample sessions to preview the stats page |

---

## Layout

```
app/
  page.tsx            home
  calendar/           month & week views
  tasks/[id]/         task detail + editing
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
  google.ts           Calendar OAuth, event push & read
  calendar.ts         calendar ranges, day placement, week layout
  calendarData.ts     assembles tasks, events and Google into one feed
  events.ts           uni-event times (exclusive all-day ends)
  taskEdit.ts         task edits → database patches
  taskStats.ts        per-task time attribution and metrics
  spotify.ts          now-playing, listening history, session sampling
  github.ts           GitHub token, cached + conditional requests, offline fallback
  githubModel.ts      response shaping, activity feed, issue → task sync (pure)
  githubData.ts       project repo overview, @i search, Repos menu, agenda work
  music.ts            rebuild what played from samples + history
  musicStats.ts       music-vs-focus statistics
  focus.ts            focus colour bands (shared by server and client)
  hooks/useModal.tsx  dialog scroll-lock, focus, dismissal, portal
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
