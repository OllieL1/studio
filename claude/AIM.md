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
