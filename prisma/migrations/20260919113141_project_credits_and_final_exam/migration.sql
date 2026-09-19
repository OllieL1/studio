-- The project is worth 40 credits (all other courses default to 10).
UPDATE "Course" SET "credits" = 40 WHERE "isProject" = true AND "credits" = 10;

-- The project's final submission works like an exam: it lands at the very end,
-- so it's kept out of the progress bar and tracked by readiness instead.
UPDATE "Task" SET "kind" = 'EXAM'
WHERE "title" = 'Final Project'
  AND "kind" = 'COURSEWORK'
  AND "courseId" IN (SELECT "id" FROM "Course" WHERE "isProject" = true);
