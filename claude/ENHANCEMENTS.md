# Enhancement List - Check Off as we go

07/10
Please note we may not have the latest changes on the stick in main on the repo. They may still be locally on the mac. Because of this, please create a branch for these changes instead of pushing direct to main.
[x] GitHub Integration - for the project, I would like to integrate my repo into its own tab in the project page. Here we should see open issues, PRs, recent changes and activity. We should be able to cite issues in the nexus notes, with an @ mention (filter with @i)
[x] We should also be able to link issues to tasks on Studio 
[x] We should be able to enhance draft from recent work from the github 
[x] Project repo: https://github.com/uog-cose/MCR-5082P
[x] Please also add a repos drop down next to Courses in the nav bar - on smaller screens just display the Github icon next to search for the dropdown. This should contain links to repos i use
- Project (shown above)
- Coaching - https://github.com/uog-cose/socs-coaching-software-teams-2026-2756026l-livingston
- SH28 Project - https://github.com/uog-cose/socs-team-project-3-h-2026-sh28-project
- SH28 Diss - https://github.com/uog-cose/socs-team-project-3-h-2026-sh28-dissertation
We should be able to add to this in Settings.
[x] Of course, authentication with GitHub can be configured in settings too.
As mentioned above lets put these in a branch, and not flash to the drive until I've tested them. These changes are exceddingly unlikely to interfere with other not committed changes.


---

## Status - 08/10/26

`[x]` done · on the `github-integration` branch, not deployed to the stick

**Not yet tried against the real repos** - built without a token, so every
screen was checked in Chrome against recorded-shape fixture data, and the
cache, offline fallback and issue → task sync are covered by tests with GitHub
stubbed. First thing to do: add a token in Settings and open the GitHub tab.

Agreed before building: token auth in Settings; a linked issue closing ticks
its task (Studio never writes to GitHub); `@i` searches the project repo.

**GitHub tab** - `/project` → **GitHub**: repo header with open issues, open
PRs and commits per week since 21 Sep; issues (open/closed, instant filter by
title, #number or label); pull requests with recently merged; recent commits;
an activity feed. Refresh asks GitHub now; offline it shows the last copy and
says how old it is.

**Issues and tasks** - **Make task** on any open issue creates a project task
linked to it; **Link…** attaches it to an existing task. Task pages have a
GitHub issues panel to link and unlink by title or number. When the last open
issue on a task closes, the task (and its subtasks) tick themselves. Linking an
already-closed issue doesn't tick, and unticking by hand sticks.

**@i mentions** - `@i` in any live editor searches the project repo's issues;
plain `@` includes them too. The chip shows `#12 Title` and opens the issue on
GitHub; PDFs print it as a link.

**Draft from recent work** - gains an **On GitHub** section: commits (first 8,
then "and N more"), merged and opened PRs, closed and new issues, with issues as
`@i` chips. If GitHub can't be reached it says so instead of leaving it out.

**Repos menu** - beside Courses: Project, Coaching, SH28 Project, SH28 Diss,
each with open PRs/issues fetched when the menu opens. Below 1100px wide it's
the GitHub mark next to search. Add, rename, reorder and remove in Settings,
which also shows whether the token can read each one.

**Authentication** - Settings → GitHub: paste a token (the link opens GitHub's
token page pre-filled with the `repo` scope).

**08/10 follow-up - the 403 was the org.** GitHub's reply: "`uog-cose` forbids
access via a personal access token (classic). Please use a GitHub App, OAuth
App, or a personal access token with fine-grained permissions." The same token
reads Project-Snippet/Snippet, so the project repo was pointed there (dev copy
only) and the whole tab verified against live data. Studio now shows GitHub's
own reason for a 403 instead of "GitHub returned 403", and fills in PR/issue
titles that GitHub has started trimming out of the activity feed.


28/09

- A few more enhancements based on my use of the site. 
[x] A general notes page for the project. This should be inspired by Notion's gallery view, we can have different pages of (markdown) notes for the project. For example, a great use of this will be links. Please ensure we use the same live/markdown editor for this feature. Please also add link as a new option in the [ menu. When link is selected, the user can paste the link and it will format it nicely (like Notions mention feature)
[x] We need to fix the live box in the projects research notes. The [ menu gets cut off by the text box, it should layer on top of it instead even if it exceeds the boundaries of the text box.
[x] When we have a set of bullets that may have some nested in them (i.e. sub bullets) after the sub bullet there is space rendered even if the next line is a bullet again. Essentially what I mean is that continuous bullets are all part of the same list and so the spacing should be equal until there is a different element 
[x] The tag system should be better for research. After a tag is created, when we go to add a tag to other research, it should autocomplete i.e. either you select an existing tag or you create a new one (when you give a paper a tag). One paper can have multiple tags.
[x] In the project notes, we should be able to @ a tag. Essentially mention it inline. We should also be able to @ a paper (using its cite code). We should also be able to @ a task. To make the @ more powerful, if we are looking for a paper we prefix @r, if we are looking for a tag we do @# and if we are looking for a task we do @t - this will filter the menu, then we can also start typing a search - the filter does not need to be mandatorily applied - it should be in the same style as the [ menu. This ties everything together cleaner and makes project notes supremely powerful. If we click on a tag, please open a page with details on that tag - what research it is mentioned in and what notes it is mentioned in. If you have any other suggestions for making project notes more powerful, please suggest them before we implement. Name the notes section Nexus

---

## Status - 28/09/26

`[x]` done

**Nexus** - the project's notebook, at `/project` → **Nexus**. A flat gallery of
markdown pages: pinned first, then newest, each card showing its icon, title,
excerpt, tags and word count, with instant search and tag filters. Notes open at
`/project/nexus/[id]` on the same live editor the lectures use, with an icon,
title, pin toggle, tag picker and autosave. Flat by design - pinning and tags do
the organising, so there are no folders to keep tidy.

**Links in the `[` menu** - pick **Link**, paste a URL, and it becomes a chip.
The page title is fetched once when it's added (3s timeout) and stored inline, so
the note reads the same offline; a failed fetch falls back to `domain/path`. The
chip shows the domain, then the title.

**The `[` menu no longer gets clipped** - both menus now render into `<body>` at
fixed coordinates (`components/editor/CaretMenu.tsx`), flip above the line when
they'd fall off the screen, and keep the textarea focused so typing still filters.
The card's `overflow-hidden` stays where it belongs.

**Bullet spacing** - a nested list is part of the list above it, not a new block.
The 14px that separates a list from a paragraph was landing after the sub-bullet;
now the gap between every bullet in a run is identical (measured: 4px either side
of a nested one).

**Tags are records now, not text** - `Tag` / `PaperTag` / `NoteTag` tables shared
by research and notes. The picker autocompletes as you type: pick an existing tag
or take the **Create #x** entry at the end of the list. A paper takes as many as
you like. Your existing comma-separated tags were migrated automatically (the old
column is left populated as a fallback, unread by the app).

**@ mentions** - in any live editor, `@` opens a menu over papers, tags, tasks,
notes and meetings. `@r` narrows to research, `@#` tags, `@t` tasks, `@n` notes,
`@m` meetings - and you can keep typing to search within that, or skip the prefix
entirely. A mention is stored in the markdown itself (`@r[key|Label]`), so it
renders identically in the editor, on the page and in PDF exports without a
lookup. Chips are colour-coded by kind and link straight through: a paper opens
the library scrolled to it and expanded, a tag opens its page.

**Tag pages** - `/project/tags/[key]` lists the research filed under a tag, the
notes tagged with it, and separately the notes that merely *mention* it. Rename in
place and it follows everywhere, including the `@#` mentions written into note
bodies; renaming onto an existing tag merges the two.

**⌘K knows about Nexus** - notes are searchable by title and body, and paper hits
now deep-link to the paper rather than the tab.

23/09

- Some real usability enhancements today after I've been using the site a fair bit 
[x] The markdown editor needs to support tab/shift tab for an indent i.e. for a bullet. Currently you are forced to use spaces to make nested bullets.
[x] 2 column support for the markdown editor. I.e. one of the options is to create 2 columns (in the [ menu)
[x] Markdown formatting within table cells. It should not just be restricted to plain text in the table cells.
[x] You should be able to delete table rows or columns. Currently you can only add but you cannot delete. 
[x] Dual view mode - pull up the note on one side with the uploaded lecture PDF in preview on the other side. This is of course only possible with a PDF being uploaded.
[x] Each course should have the ability to add its Moodle link. Once added there should be an easily accesible button to access the Moodle.
[x] In the day of the week stats, we should provide the focus average for that day i.e. when you hover over it - in the same way it is done for time of day stats .
[x] Callout does not work - it just makes a quote and starts it with note. Can we make a custom callout for callout this inserts a clean rounded background box around the text you put in it. The colour of this should be not the same as the rest i.e. to call it out/highlight it.  Ensure the PDF export gets the same treatment.
[~] In all places where we have markdown text boxes, can we port in our lecture system with live and markdown and the [ menu? this should be generalised and usable throughout the site
[x] In focus mode for writing lectures, please hide the bar at the top unless you hover up there and then we can cleanly display it. This is for ultra minimalism for when focussing on lectures.

---

## Status - 23/09/26

`[x]` done · `[~]` done where it applies

**Tab and Shift-Tab** indent and outdent whole lines, so nested bullets no
longer mean counting spaces. A selection shifts together.

**Two columns** - `[` → Two columns (or just "2"). The block edits as two panes, each a full
editor (headings, bullets, code, maths); Escape renders it, ⌘↵ carries on
underneath. Stored as `::: columns … ||| … :::`, so raw markdown and the PDF
agree. The PDF lays both columns out and continues below the taller one.

**Markdown in table cells** - a cell shows **bold**, `code`, *emphasis*,
~~strikethrough~~ and links rendered, and switches to raw markdown when you
click into it. Rendered inline in the browser rather than through the server,
so typing stays instant.

**Deleting rows and columns** - every row has a menu at its end (add below,
delete), matching the column menu in the header. Backspace on an empty row
still removes it. **Whole blocks** go too: "Delete table" and "Delete columns"
sit in each block's toolbar, and ⌘⌫ does the same from inside one. A block
with anything in it asks first, since the editor has no undo.

**Dual view** - "Slides" puts the attached PDF beside the note, with a
draggable divider and a picker when more than one is attached (⌘⇧S). It uses
the browser's own PDF viewer, so scrolling, zoom and search come for free.

**Moodle** - a link per course, set inline from the course header (and the
project page), then a one-click button. `Course.moodleUrl`.

**Day of week stats** now show focus on hover, like the hour chart:
"82% focus · 3 Tuesdays". The printed stats report shows it on the bars.

**Three heading levels** in the menu - Heading 1 / 2 / 3, inserting `#`,
`###` and `######`. The levels skip a step each time so the sizes are
obviously apart (30px / 18px / 15px); `##` and `###` render too alike to be
worth separate entries.

**Callout** is a real callout now: `> [!note]`, rendered as a rounded tinted
box in a colour nothing else uses, with an optional bold title. The PDF draws
the same box - measured first, so it never splits across a page. The syntax is
Obsidian's, so notes stay portable.

**The editor is now shared** - meeting agendas, meeting notes and paper notes
all use it: live blocks, the `[` menu, tables as grids, callouts and maths,
with the same Live / Markdown switch (⌘/). Task and session notes were left as
plain fields, as agreed - they hold scraps, not structure.

**Focus mode** hides the top bar until the pointer goes near the top of the
screen, then slides it in.


19/09

[x] The project is a very specific piece of work and I want to build essentially a project management system for it that is easy to use and hugely aids with it.
- Features:
  - Supervisor meetings - these should be their own type of event that I can tag tasks too (the same prerquisite system as)
  - Research - this is a big one. I want to be able to save links to papers that I read, with some notes on them.
  - I should be able to easily export a list of papers with their notes i.e. multiselect then export to a PDF.
  - Project tasks - these will be the same underlying system as our other course tasks. We should see a project schedule on the project page that shows meetings, project deadlines and tasks. This should also be able to be exported to PDF.
  - Add a space to link the GitHub. We will build github integration in future for this but not yet. 
  Note I'm doing an MSci Project for Software Eng. with a Year Placement course at UofG (40 credits). If you have any other suggestions to what we could add to this page, let me know so we can build out this functionality as best as possible.
[x] I have plugged in a kingston drive with 8GB and named it STUDIO. The old drive has been renamed STUDIO-OLD. Please port over our functionality to this new drive as hopefully we should see more luck with this.


---

## Status - 19/09

**Project workspace** (`/project`, in the nav) - tabs for Overview, Meetings, Research, Tasks.
- Overview: hours against 400h with needed vs recent pace per week; next meeting with prep
  and agenda status; a week-by-week schedule to 26 March (meetings, graded deadlines, task
  bars), exportable as a landscape PDF that also lists undated open tasks.
- Meetings: one-off, optional Google sync, prep tasks, agenda with "Draft from recent work"
  (hours, tasks done, papers read, open actions, prep outstanding, what's coming up), notes,
  and action items that become project tasks.
- Research: paste an arXiv/DOI link and details fill in (Crossref/arXiv); status, tags,
  markdown notes; filter and search; multi-select export to PDF with notes, or BibTeX.
- Tasks: quick-add defaults to the project; tasks get an optional planned start, which
  draws them as bars on the schedule.
- GitHub repo link on the project header (integration later).
- Meetings show on the calendar; papers and meetings are in Cmd-K search.

**New drive** - Studio now runs from the Kingston (`STUDIO`); data copied from the old stick
byte-for-byte. `STUDIO-OLD` is untouched - retire it once you're happy.

18/09

[x] SMall bug - clicking out of the new event modal on the calendar screen seems to scroll us down the page a bit for some reason
[x] Spotify integration is working well - lets factor music into the stats. We can include music in each session since we have it integrated. Factor in some stats for music too - relating to focus and anything else you think would be interesting.
- Most played while studying is not needed. Focus by artist is really interesting. Music vs silence is great. You can remove on repeat vs varied and podcatss vs music. Variety vs focus is great. You can remove your study tracks. I like the bar on the top. Remember to add the listening time and top artist to each session too i.e. on the sessions screen. Music by time of day and day of the week would be cool too.
[x] On the task specific pages, for editing tasks we should hide this menu behind another click / make it a modal - there is no reason to have it as obvious on the screen.
[x] Lecture specific pages should also display their time tracking metrics as well as the written note display.  So we can see how much time has been spent on each task.
[x] Mark as revision on the course page doesnt need to be there for courses with no exam.
[x] Allow for export of individual lectures on their page i.e. where we have write and preview, we should be able to export these to PDF.
[~] We are seeing some of these console errors. Nothing too important but if you know a fix, it would be great
- A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:
- A server/client branch `if (typeof window !== 'undefined')`.
- Variable input such as `Date.now()` or `Math.random()` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

See more info here: https://nextjs.org/docs/messages/react-hydration-error


+
Client
-
Server
  ...
    <HTTPAccessFallbackErrorBoundary pathname="/" notFound={<SegmentViewNode>} forbidden={undefined} ...>
      <RedirectBoundary>
        <RedirectErrorBoundary router={{...}}>
          <InnerLayoutRouter url="/" tree={[...]} params={{}} cacheNode={{rsc:{...}, ...}} segmentPath={[...]} ...>
            <SegmentViewNode type="page" pagePath="page.tsx">
              <SegmentTrieNode>
              <HomePage>
                <div className="space-y-10">
                  <section className="animate-fa...">
                    <p>
                    <h1>
                    <Card>
                      <div className="card relat...">
                        <div>
                        <div className="mt-6 borde...">
                          <div>
                          <Sparkbar data={[...]}>
                            <div className="relative">
                              <div className="flex items..." style={{height:44}}>
                                <button
                                  onMouseEnter={function onMouseEnter}
                                  onMouseLeave={function onMouseLeave}
                                  onFocus={function onFocus}
                                  onBlur={function onBlur}
                                  className="group relative flex-1 outline-none"
                                  style={{height:44}}
+                                 aria-label="Sat, 29 Aug: 1h 24m"
-                                 aria-label="Sat 29 Aug: 1h 24m"
                                >



---

## Status — 18/09/26

`[x]` done · `[~]` fixed, but only verifiable in Safari

**Modal scroll bug** — confirmed fixed. Didn't happen in Chrome, and headless Safari wouldn't run here, so
all three plausible Safari causes are fixed together: the page is scroll-locked while a dialog is
open and restored exactly on close; the first field is focused without scrolling; and dialogs
close on a full click, not mousedown (which let the click fall through to the calendar). Verified
in Chrome: scroll position unchanged to the pixel, no click-through, and dragging a text
selection out of a dialog no longer closes it.

**Music in stats** — whatever plays while the timer runs is logged with the session (podcasts too),
plus Spotify's history for stretches the app was closed. Not possible: genres and audio features
(tempo, energy) — Spotify has blocked both for new apps.

*Revised after feedback:* kept the tile bar, focus by artist, music vs silence and variety vs
focus; removed most played, on-repeat vs varied, podcasts vs music and study tracks; added music
by time of day and by day of week (as the share of study time with music on — raw minutes would
just echo when you study). Each session now shows its top artist and listening time, with the
share of the session that had music.

**Task editing** — behind an Edit button (or **E**) in a modal.

**Lecture pages** — time tracked and work history under the notes.

**Revision** — only on courses with an exam (PSI, RMT, FP). A course already in revision keeps
the control so it can be switched off.

**Lecture PDF** — PDF button in the Write/Preview toolbar; saves first, then opens the save dialog.

**Console errors** `[~]` — the hydration error was Safari and Node formatting dates differently
("Sat, 29 Aug" vs "Sat 29 Aug"). All date formatting is now hand-rolled, so both sides produce
identical text. The week view's "now" line also rendered from two different clocks — it now
appears after load. The 404 was a missing favicon. Chrome shows zero console errors on every
page; **please confirm Safari's console is clear too.**


17/09/36

[~] Spotify integration - displays currently playing song for more personalisation 
[x] Remove the ctrl k visual aid on the search bar - I know ctrl k works so i dont need the hint. Please make the search bar look cleaner in that top right. 
[x] Add the Add to Google Calendar button in the detail menu for creating a new task
[x] Tasks should have their own expandable pages where you can see the task in detail, see its subtasks, its history of work tagged to it, see its time tracking metrics and stats. Essentially a full task view. 
[x] Tasks should be editable! Allow editing of all properties of a task - this is a given. 
[x] Calendar view - pull the google calendar plus the tasks and have a calendar view. Default to a month. This can be an insanely useful view with some details on the side of the page for upcoming coursework - exams can be blocked especially or big coursework with large weighting. Allow the creation of events here - these are not tasks but uni events i.e. meetings with project supervisor. These should have the option to sync to google calendar ofc. 
- Ensure our calendar view is powerful, useful and sleek. We want the calendar view to be a major benefit to the site - I want to centralise my work, schedule and everything into this site ideally.


---

## Status — 17/09/26

`[x]` done · `[~]` built, needs one action from you

**Search bar** — shortcut hint gone; a quiet rounded field in the top right that opens
the same ⌘K palette.

**Calendar in the task composer** — Detail menu has an "Add to Google Calendar" switch.
The task is saved first, so if Google refuses, the task isn't lost; you get a warning.

**Task pages** (`/tasks/[id]`) — open any task from its title, the calendar or ⌘K.
Subtasks (add, tick, rename, remove), prerequisites and what's waiting on it, and
time tracking: total, per session, focus, last worked, by weekday, plus full work
history. A session tagged to several tasks is **shared evenly** between them, so
time is never double-counted — the page says so when it happens.

**Editing** — every property from the task page: title, course, type, date, time
(or start/end for classes), grade weight, notes, priority, cancelled, exam diet.
Saved together, with discard. If the task is on Google Calendar, the event updates.

**Calendar** (`/calendar`) — month (default) and week. Shows Google events, deadlines,
exams, lectures and labs; study sessions left off as agreed.
- Exams and coursework worth **15%+ are blocked out** with a hatched tint.
- Month collapses a day's classes to coloured dots so deadlines stay visible.
- Week puts classes and meetings at their real times, side by side when they overlap.
- Sidebar: big deadlines, the next 6 weeks by week, exams with readiness.
- Filters for each kind; click anything for details without leaving the page.
- Click a day or time slot to create a **uni event** (one-off), optionally synced
  to Google. Edits update the Google copy; turning sync off removes it.
- Anything this app pushed to Google isn't shown twice.
- Keys: ← → page · T today · M/W switch · N new event.

**Spotify** — built: now-playing sits beside the timer with artwork, a progress
bar and equaliser. **Needs Spotify credentials in `.env`** — five steps at `/settings`.
Spotify doesn't accept `localhost` as a redirect URI, so it has to be
`http://127.0.0.1:3000/api/spotify/callback`, and you briefly land on 127.0.0.1 during
sign-in.

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
