-- Coaching's nine weekly quizzes are worth 20% between them, shared evenly
-- (20/9 % each). Quiz 10 doesn't run, so it carries no weight. Matched by
-- course code and title, so the stick's live database gets it too.
UPDATE "Task" SET "gradeWeight" = 20.0 / 9
WHERE "title" IN ('Weekly Quiz 1', 'Weekly Quiz 2', 'Weekly Quiz 3', 'Weekly Quiz 4', 'Weekly Quiz 5',
                  'Weekly Quiz 6', 'Weekly Quiz 7', 'Weekly Quiz 8', 'Weekly Quiz 9')
  AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');

UPDATE "Task" SET "gradeWeight" = NULL
WHERE "title" = 'Weekly Quiz 10'
  AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');
