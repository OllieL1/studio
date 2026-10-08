# Study Planner - 26/27

### Motivation

I had a study planner for my third year exams and it worked incredibly well. I respond really well to metrics, stats and good visualisation of how I am progressing with my work.

### What we need to build 

- Website for me managing my work 
- Clean modern UI - not tacky but bold and clean - easy to use and explore. Use muted colours - maybe some muted/rusty orange would be a good primary colour. Dont be afraid to put some flair into it - some background patterns/interesting usability/subtle animations - I want to enjoy using this site for a year and be happy to show it off to people. Dont overuse shadows or use any gradients - these look tacky. Always remember we are looking for a sleek, modern UI and most importantly, sheer usability.
    - Please pick a full palette + typography system and document it in DESIGN.md (muted rusty orange primary, neutral scale, semantic colours, type scale, motion rules).
- Home page should show:
    - Overall progress bar 
    - Each courses progress 
    - Todays scheduled work 
    - Some stats and metrics
    - Ease to create new tasks with all the relevant fields. Ensure this is done in an intuitive and clean way - dont make it one of those typical boring infinite feeling set of form fields.
- Stats page with a bunch of visuals and helpful analytics 
    - Daily averages, best times of day, best days of week, and poorest, history, breakdown per subject
- Time tracking -> key feature - this should be globally visual on the screen on the website - it is essentially an on/off button - when you turn it on, it notes the start time and then when it is switched off it asks for a name for the session, which subject/s were studied and if the time needs to be adjusted (down the way only) - also asks for a focus rating out of 100 (a %), this focus meter should also be reflected in the stats page i.e. factor it into a section in the stats 
- We need to obviously persist data - this should not be done with local storage (i am scared of losing it), but it should be persisted locally in a data structure that we COULD eventually migrate to an actual database if we so wanted too 
- You will find in SUBJECTS.md some information about my subjects for first semester. These should be factored into the data structure - do not hardcode these - either give me a population script for these initial entries or popuilate it yourself. 
    - You will see each course has its lectures - these should be created as their own type of task (a lecture) with 3 completion parts to it - Attendance, Typed Notes, Handwritten Notes 
    - A lab should have two bits to it - Attendance, Lab Completion 
    - Coursework should allow us to create subtasks and also have dependent tasks i.e. these tasks should be completed before coursework - do not set this up that coursework cannot be completed before these are completed, it is more for visuals i.e. an exam will be dependent on all lectures (i.e. these should all be done before the exam)
    - My lectures and labs for first semester start on the week beginning Sep 28th 2026 and end on w/b 30th November 2026. Exams dont have a fixed date yet but it is noted if they will be December or April May
- You can ask me for clarification on more things before we start implementing. After clarifications, please update this md so we have it permananently noted.
---

## Clarifications (agreed 15 Sep 2026)

### Stack & persistence
- **Next.js (App Router) + Prisma + SQLite**, single app, `npm run dev` → localhost:3000.
- Data lives in `prisma/dev.db` — one file, trivially backed up by copying it.
- Prisma schema means migrating to Postgres later is a connection-string + provider change, no rewrite.
- No localStorage for real data (timer draft state excepted as a crash-safety mirror only).

### Progress model
- Each course has three weights that sum to 100: **lecture / lab / assessment**, tunable per course.
- **Exams are excluded from the progress bar** — they're marked off right at the end, so they'd
  distort the signal all year. Instead an exam is surfaced as its own **countdown card** showing
  the diet (December 2026 or April/May 2027) and a **dependency-readiness indicator**
  (e.g. "18/20 lectures done").
- Courses with no labs: lab weight is 0 and the remaining categories **auto-rescale to fill 100**,
  so no empty lab bar is ever shown.
- Category progress = completed checklist parts / total parts. Assessment progress is weighted
  pro-rata by each assessment's real grade weight where one is known, equal-weighted where not.

### Task types
- **Lecture** — 3 parts: Attendance, Typed Notes, Handwritten Notes.
- **Lab** — 2 parts: Attendance, Lab Completion.
- **Coursework** — free-form subtasks + dependent tasks. Subtasks are added
  inline by expanding the task row; they are **equally weighted** within the
  task (n subtasks ⇒ 1/n each). Adding the first subtask to an already-ticked
  task preserves its completion rather than silently undoing it.
- **Exam** — depends on all lectures for the course. Dependencies are **advisory/visual only**;
  nothing is ever blocked from being completed early.

### Timetable generation
- Generate **every lecture/lab instance for all 10 weeks**: w/b Mon 28 Sep 2026 → w/b Mon 30 Nov 2026.
- Weekly quizzes generated too (Coaching Software Teams ×10, Functional Programming ×10).
- All instances are editable/deletable after the fact (cancellations, reading week).

### Timer
- Global on/off control, visible on every page, survives reload.
- Stop dialog collects: session name, subject(s), **optional task link(s)**, duration adjustment
  (**down only**), focus rating 0–100%.
- Task linkage enables time-per-task analytics ("how long did that coursework actually take").
- **Uneven subject splits** (added 15 Sep 2026): a session covering two or more
  subjects can divide its time **equally**, **by percentage**, or **by explicit
  minutes**. Each subject's slice is stored on `SessionCourse.minutes` and the
  slices always sum to exactly `Session.minutes` (largest-remainder rounding).
  All per-subject analytics read the stored slice, so they reconcile against
  total tracked time no matter how a session was divided.

### Data corrections
- Placement Year Review: `07/08` and `19/08` were typos → **07/10/2026** (Report/Essay) and
  **19/10/2026** (Poster / Project Proposal). Seeded as upcoming.
- Coaching Software Teams dates `27/01` and `03/03`, and `08/03`, fall in **2027**.
- PSI and Constraint Programming list no grade weights → their non-exam assessments are
  equal-weighted until you set real values.
- **Project** is `COMPSCI5082`, with **Final Project due Friday 26 March 2027**
  seeded as coursework. Subtasks to be added in-app as the work takes shape.
  *(Superseded 19 Sep 2026: the Final Project is now an **exam** - see below.)*


---

## Enhancements (15 Sep 2026) — see claude/ENHANCEMENTS.md

- **Semesters.** `Course.semester` (1 / 2 / 3 = all year). Semester-2 courses are
  seeded but hidden from every page until `SEMESTER_2_VISIBLE_FROM` (1 Jan 2027).
  Coaching is full-year. Gating is applied at the query level, so hidden courses
  never reach the UI.
- **Typed notes** are markdown, written in-app and stored on `Task.notesMd`.
  Rendered with `marked` + `highlight.js`, sanitised with DOMPurify.
- **PDF export** uses the browser's print engine over a print stylesheet, not a
  JS PDF library — better typography and page-breaking, no dependency to maintain.
- **Handwritten notes** record `Task.notebook` (Space / Physics / Computing — cover
  designs) and `Task.notebookPages`.
- **Revision mode** (`Course.revisionMode`) adds an unticked `Revised` item to every
  lecture. The original three parts stay ticked; the lecture drops to 3/4 and the
  course re-opens. Reversible and idempotent.
- **⌘K search** covers courses, lectures, tasks and note full text, ranked
  exact → prefix → substring.
- **Google Calendar** is full OAuth (`GoogleAuth` singleton, tokens refreshed on
  demand). `Task.calendarEventId` makes a second push an update, not a duplicate.
  Dormant until `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are set.
- **Course palette** re-validated at 10 colours; validator vendored to
  `scripts/palette/` so it stays reproducible across sessions.


---

## Enhancements (17 Sep 2026)

- **Calendar**: month (default) + week. Shows Google events, deadlines/exams, lectures
  and labs — **not** study sessions. Exams and coursework ≥ `BIG_WEIGHT_THRESHOLD`
  (15%) are blocked out. Items this app pushed to Google are de-duplicated.
- **Uni events** (`Event` model) are **one-off only**, optionally synced to Google.
  All-day events store an exclusive end (Google's convention).
- **Task pages** at `/tasks/[id]`; every task property editable. A session tagged to
  several tasks is split **evenly** between them for per-task time.
- **Spotify** is read-only now-playing beside the timer. Redirect URI must be
  `http://127.0.0.1:3000/api/spotify/callback` — Spotify forbids `localhost`.


---

## Enhancements (18 Sep 2026)

- **Music per session.** `SessionTrack` rows, rebuilt at stop from now-playing samples
  (`ListeningSample`, taken while the timer runs) plus Spotify recently-played history.
  `Session.musicTracked` distinguishes "silent" from "unknown"; only tracked sessions
  enter music stats. No genres/audio features — blocked by Spotify for new apps.
- **Dates are formatted by hand** (`lib/dates.ts`), never `toLocaleDateString`, because
  Safari and Node disagree and React reports the difference as a hydration error.
- **Every dialog is portalled to <body>** and uses `useModal` (scroll lock + restore,
  focus without scroll, click-not-mousedown dismissal).
- **Server components must not call functions from "use client" modules** —
  `scripts/check-boundaries.mjs` enforces it in `npm test`.
- Task editing lives in a modal (**E**); revision only shows for courses with an exam.


---

## Name (18 Sep 2026)

The app is called **Studio** — *study* + *IO*. Wordmark: all in the display serif, with "io" in rust. Tab icon: a house.


---

## Project workspace (19 Sep 2026)

- The dissertation course is flagged `Course.isProject` (with `hoursTarget` 400, `repoUrl`).
- Supervisor meetings are **one-off** (`Meeting`), with prep tasks (`MeetingPrep`), agenda,
  notes, and action items created as `Task`s of kind OTHER linked by `fromMeetingId`.
- Papers (`Paper`) are looked up from DOI (Crossref) or arXiv; exports to PDF and BibTeX.
- Tasks have an optional `startsAt` for the schedule timeline.
- Chosen extras: 400-hour tracker, auto-drafted agenda, BibTeX. Not chosen: milestones/chapters.
- The project has **no course page**: every link to it (Courses menu, home card, search, task
  pages) goes to `/project`, and `/courses/<project id>` redirects there. Its weights/credits
  editor lives in the project header; its time stats (the project's slice of each session only)
  sit at the bottom of the overview.


---

## Credits & project progress (19 Sep 2026)

- **Overall progress is weighted by credits** (`Course.credits`, editable next to the weights).
  Project = 40, every other course = 10, 130 in total. Courses with no tasks yet (semester 2
  before January) are left out rather than counted as 0%.
- **Every project task counts towards the project's bar**, including meeting actions (OTHER
  counts as assessment on the project course only).
- **The Final Project submission is treated as the exam**: it's excluded from the bar, and its
  readiness is "project tasks done" rather than prerequisite lectures.


---

## Tidy-up (20 Sep 2026)

- **Every export is a built PDF** (`lib/pdf/`, served from
  `/api/project/papers/pdf`, `/api/project/schedule/pdf`, `/api/stats/pdf` and
  `/api/lectures/pdf`), not printed from a web page. Nothing uses the browser's
  print engine any more. Continuous
  layout, an entry never split across a page break, clickable DOI/arXiv links,
  notes rendered from markdown with the date they were written (`Paper.notesAt`).
  Inter and Fraunces are committed under `assets/fonts/` and traced into the
  standalone build so the exports work from the stick, offline. The schedule is
  landscape: an outline band of headline numbers, the runway drawn from the same
  timeline maths as the screen (`lib/project.ts`, so paper and app can't drift),
  then every item week by week. Lecture notes still export through the browser's
  bound document: one lecture, or a whole course with a cover, a contents list
  with real page numbers (the body is laid out twice - once to find where each
  lecture lands) and one lecture per page. `lib/pdf/markdown.ts` draws the notes:
  headings, lists, quotes, fenced code, tables, rules and inline
  bold/italic/code/links. Images are skipped by design - Studio runs offline.
  Bundled fonts: Inter (regular/semibold/italic), Fraunces, Roboto Mono. Roboto
  Mono rather than the UI's JetBrains Mono because fontkit crashes laying out
  its coding ligatures - "->" in a code block killed the whole export.
  The stats report follows the page's own order and honours the range picker;
  its charts are drawn by `lib/pdf/charts.ts`, which follows the same rules as
  the on-screen charts: recessive axes, thin marks, colour for identity only,
  and selective direct labels (the peak, the series ends) rather than a number
  on every bar - print has no hover to fall back on.
- **Session location** (`Session.location`, plus `locationNote` for "Other"):
  coffee shop / library / flat / home / campus / other. The stop dialog
  pre-selects wherever the last session was. Stats gain a "Where you work"
  section; sessions logged before this are reported as untagged rather than
  folded into a bucket.
- **Sessions are editable** after the fact - name, location, focus, notes and the
  subject split - but never their timing, which is the one figure that should
  stay honest.
- **Music variety** already counted a track's primary artist only, so a song
  credited "Masego, Don Toliver" has always counted as Masego. Left as it was.


---

## Lecture editor (20 Sep 2026)

- **Live editing, not write/preview.** A note is one markdown string split into
  blocks (`lib/editor/blocks.ts`). The block the caret is in is a plain textarea
  of raw markdown; every other block shows rendered HTML. Rendering goes through
  `/api/render`, the same renderer as the PDF, so editor, export and print can't
  drift. Only the block you just left re-renders, so typing never waits.
- **The blocks array lives in a ref as well as state.** Blur, Enter and the
  insert menu all fire before React re-renders; reading state in those handlers
  resurrects stale text (an emptied list item, a duplicated paste).
- **The active textarea is uncontrolled**, with `key` for identity: a controlled
  value loses characters when typing outruns the state round trip. Programmatic
  edits write to the DOM and then sync state, never the other way round.
- **`[` opens the insert menu** - headings, lists, checklists, quote, code,
  table, divider, link, callout. It owns Enter/arrows/Escape and stops
  propagation, or the same Enter also splits the block underneath.
- **Properties at the top**: completion, handwritten notebook reference, and
  attached PDFs. **⌘.** is minimal mode (a restyle of the editor's own
  container - rendering it elsewhere would remount it and lose the session),
  **⌘/** raw markdown, **⌘⇧T** the time panel (read-only; the global timer is
  still the only way to log time).
- **Attachments** (`Attachment`) are PDFs stored beside the database in
  `data/uploads`, never in it, with generated names. The local backup mirrors
  that folder, since VACUUM only covers the database.

### Editor, second pass (20 Sep 2026)

- **Live is the default and says so**: a Live / Markdown segmented control,
  rather than a button whose label was the mode you weren't in. In focus mode
  it sits in the top bar with the save state, Time, PDF and Exit.
- **Equations**: `$…$` and `$$…$$`, rendered by KaTeX to **MathML** - browsers
  draw it natively, so there's no stylesheet and no web fonts to ship offline.
  Bad LaTeX shows its source in red instead of breaking the note. `$5 and $6`
  is not maths. **In the PDFs, equations are typeset**: MathJax renders the
  LaTeX to SVG paths and `svg-to-pdfkit` draws them (`lib/pdf/math.ts`), inline
  as well as display, with unparseable LaTeX falling back to its source in mono.
  A line containing inline maths is laid out by hand, because pdfkit's text flow
  can't carry a drawing along with the words. Size goes onto the SVG in user
  units - stated in "pt" it gets re-scaled by 4/3 and collides with the next
  word. MathJax is CommonJS and loaded via createRequire, so tracing can't see
  it: `next.config.ts` includes `mathjax-full/js` and excludes its 23MB es5
  build.
- **Tables edit as a grid** (`lib/editor/tables.ts` + `TableEditor`): Tab walks
  the cells and appends a row off the end, ⌘↵ leaves, and each column has
  alignment and add/delete. The grid holds its own state - serialising trims
  cells, so round-tripping every keystroke ate the space in "n log n".
- **Selecting more than one block**: ⌘A takes the block then the whole note,
  Shift+↑/↓ and Shift+click extend, and a selection can be copied (as markdown),
  cut or deleted. Shift-click is caught on mousedown, because by click time the
  block being edited has blurred and the anchor is gone.
- **Block-level inserts start their own block** when the line already has text:
  a table glued onto the end of a paragraph parses as one malformed table.
- Shortcut keys are matched case-insensitively (Caps Lock reports "C").


---

## Dark mode (21 Sep 2026)

- **Auto by default**: dark 21:00-07:00, both hours editable in Settings, plus
  fixed Light and Dark. Stored in `Preference` (one row), so the setting follows
  the stick between the Mac and the ThinkPad.
- **Resolved on the server**, which is what prevents the flash - see DESIGN.md.
  A client watcher flips a tab that's open across the boundary, and re-checks on
  visibilitychange because a sleeping laptop wakes with a stale timer.
- **One ramp, two themes**: the neutral scale inverts, so components didn't need
  theme-aware markup. Course colours go through CSS variables (`cssColour`),
  with a dark palette validated by `scripts/palette/`.


---

## GitHub (8 Oct 2026)

- **Token, not OAuth.** `GitHubAuth` singleton, pasted in Settings and checked
  against `/user` before saving; `GITHUB_TOKEN` in `.env` is a dev fallback.
  Verified 8 Oct: `uog-cose` **forbids classic tokens** ("use a GitHub App,
  OAuth App, or a fine-grained token"), while a classic `repo` token reads
  personal/other-org repos. A fine-grained token is scoped to one resource
  owner, so covering uog-cose *and* other owners would need a token per owner.
- **Read-only.** Studio never writes to GitHub.
- **Issue → task is one-way, on the transition.** `TaskIssue` keeps a snapshot
  (title, state) per link. When an issue Studio last saw open is now closed and
  it was the task's last open issue, `completeTask` ticks the task and every
  item. Never unticks, never ticks on link (`syncIssueLinks`, pure + tested).
- **`@i` searches the project repo only.** Ids carry the repo
  (`@i[owner/repo#12|Title]`), so widening the scope later breaks nothing.
- **Repos menu**: the project repo (from `Course.repoUrl`) first, then `Repo`
  rows. The three starting repos and the project's repo link are inserted by
  the migration, because the stick is migrated, never re-seeded.
- **Caching**: `GitHubCache` (key = API path) with ETag; fresh for 60s,
  conditional after, stale-but-shown offline. The GitHub tab streams behind
  Suspense; issue sync runs in `after()`.

