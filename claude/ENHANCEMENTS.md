# Enhancement List - Check Off as we go

17/09/36

[] Spotify integration - displays currently playing song for more personalisation 
[] Remove the ctrl k visual aid on the search bar - I know ctrl k works so i dont need the hint. Please make the search bar look cleaner in that top right. 
[] Add the Add to Google Calendar button in the detail menu for creating a new task
[] Tasks should have their own expandable pages where you can see the task in detail, see its subtasks, its history of work tagged to it, see its time tracking metrics and stats. Essentially a full task view. 
[] Tasks should be editable! Allow editing of all properties of a task - this is a given. 
[] Calendar view - pull the google calendar plus the tasks and have a calendar view. Default to a month. This can be an insanely useful view with some details on the side of the page for upcoming coursework - exams can be blocked especially or big coursework with large weighting. Allow the creation of events here - these are not tasks but uni events i.e. meetings with project supervisor. These should have the option to sync to google calendar ofc. 
- Ensure our calendar view is powerful, useful and sleek. We want the calendar view to be a major benefit to the site - I want to centralise my work, schedule and everything into this site ideally.

15/09/26

[x] Add second sem courses (only display them on UI as options or courses after Jan1st 2027)
    - Advanced Systems Programming
    - Advanced Networked Systems 
    - SPRE
    - Note coaching is a full year course (both sems)
[x] For the typed notes, it would be ideal to do one of two things - either add a link to the Notion note upon submission or maybe even cooler would be to build a markdown parser for notion/obsidian that can render the notes in our site. Then we build an export feature to download it as a really nicely formatted PDF. Add an export all button to download all lecture notes for a course in order, paginated with a table of contents at the start. These would be incredibly useful features.
[~] Add to Google Calendar button - for any type of task, a button during the creation of a task to add it to Google calendar. Obviously we will need to setup the auth for this so that it has the permission to do so and add to a specific calendar. 
[x] For the handwritten notes part of lectures, please add a place to add a note on which pages of which notebook they are in. The three types of notebooks currently are Space, Physics and Computing (these are the cover designs of the notebooks not their content)
[x] CTRL K - powerful search across the site for finding specific lectures easily, specific coursework, courses - global across all pages with a smart search
[x] Lectures page - this goes hand in ahnd with the typed notes. There should be a dedicated lectures page where you can filter by course and see all its lectures in order segregating handwritten and typed i.e. where the markdown render lives with export options + finding which pages the handwritten notes belong too 
[x] Key one: Mark Course for Revision button - this will uncheck all lectures from being completed and add a 4th thing that needs to be done for them Mark as Revised - this is what is relevant for the exams and should mark all lectures as needing to be recovered  - then they can be checked once I have studied them further. This is to futureproof the site for when I need it for revision to save me unchecking all the lectures or creating duplicate tasks.

Please remember to adhere to the design philopshy and prioritise usability while have some flair with it. I really like the site so far so lets keep moving in this direction. 

---

## Status — 15/09/26

`[x]` done · `[~]` built, needs one action from you

**Second semester** — Advanced Systems Programming, Advanced Networked Systems and
SPRE seeded as shells, hidden from every page until **1 Jan 2027**. Coaching marked
as full-year so it stays visible. Reveal date: `SEMESTER_2_VISIBLE_FROM` in
`lib/types.ts`. Fill in codes/timetables in `prisma/seed.ts` when published.

**Typed notes** — markdown editor with live preview and autosave on every lecture
(`/lectures/[id]`), rendered in-site with syntax highlighting and an outline.
Export one lecture to PDF, or a whole course with a title page, contents and one
lecture per page (`/courses/[id]/notes`). PDF is the browser's own print engine
over a print stylesheet — better typography and page-breaking than a JS PDF
library, and no dependency to maintain.

**Handwritten notes** — notebook (Space / Physics / Computing) + page range per
lecture, editable inline on the lectures list or the lecture page, and searchable.

**⌘K search** — courses, lectures, tasks, and the **full text of typed notes**,
with matching excerpts. Ranked exact → prefix → substring; keyboard-only.

**Lectures page** — `/lectures`, filter by course and by what's missing
(no typed notes / no handwritten reference), with export-all per course.

**Revision mode** — per course, adds an unticked **Revised** step to every lecture.
Attendance and notes stay ticked, the course drops to ~75% and re-opens. Reversible
and idempotent; 9 tests cover it.

**Google Calendar** — full OAuth is built and wired: one click on any dated task
creates the event, a second click updates rather than duplicates, and you can pick
the target calendar. **It needs Google credentials in `.env` before it will do
anything** — six steps, about five minutes, written out in the app at `/settings`.
Until then the button is inert and says so rather than erroring.
