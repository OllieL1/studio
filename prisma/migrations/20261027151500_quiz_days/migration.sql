-- Quiz days, so the live database on the USB stick gets them too (the seed
-- only runs on the dev copy). Quiz n is due in teaching week n+1:
-- Coaching on Tuesdays at 12:00, the last on 1 Dec (Quiz 10 doesn't run);
-- Functional Programming on Mondays at 23:59. Times are explicit local
-- instants (BST before 25 Oct, GMT after), matched by course code and title.

-- Coaching 1: Tue 6 Oct, 12:00
UPDATE "Task" SET "dueAt" = 1791284400000, "weekStart" = 1791154800000
WHERE "title" = 'Weekly Quiz 1' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');

-- Coaching 2: Tue 13 Oct, 12:00
UPDATE "Task" SET "dueAt" = 1791889200000, "weekStart" = 1791759600000
WHERE "title" = 'Weekly Quiz 2' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');

-- Coaching 3: Tue 20 Oct, 12:00
UPDATE "Task" SET "dueAt" = 1792494000000, "weekStart" = 1792364400000
WHERE "title" = 'Weekly Quiz 3' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');

-- Coaching 4: Tue 27 Oct, 12:00
UPDATE "Task" SET "dueAt" = 1793102400000, "weekStart" = 1792972800000
WHERE "title" = 'Weekly Quiz 4' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');

-- Coaching 5: Tue 3 Nov, 12:00
UPDATE "Task" SET "dueAt" = 1793707200000, "weekStart" = 1793577600000
WHERE "title" = 'Weekly Quiz 5' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');

-- Coaching 6: Tue 10 Nov, 12:00
UPDATE "Task" SET "dueAt" = 1794312000000, "weekStart" = 1794182400000
WHERE "title" = 'Weekly Quiz 6' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');

-- Coaching 7: Tue 17 Nov, 12:00
UPDATE "Task" SET "dueAt" = 1794916800000, "weekStart" = 1794787200000
WHERE "title" = 'Weekly Quiz 7' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');

-- Coaching 8: Tue 24 Nov, 12:00
UPDATE "Task" SET "dueAt" = 1795521600000, "weekStart" = 1795392000000
WHERE "title" = 'Weekly Quiz 8' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');

-- Coaching 9: Tue 1 Dec, 12:00
UPDATE "Task" SET "dueAt" = 1796126400000, "weekStart" = 1795996800000
WHERE "title" = 'Weekly Quiz 9' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');

-- FP 1: Mon 5 Oct, 23:59
UPDATE "Task" SET "dueAt" = 1791241140000, "weekStart" = 1791154800000
WHERE "title" = 'Weekly Quiz 1' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI4021');

-- FP 2: Mon 12 Oct, 23:59
UPDATE "Task" SET "dueAt" = 1791845940000, "weekStart" = 1791759600000
WHERE "title" = 'Weekly Quiz 2' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI4021');

-- FP 3: Mon 19 Oct, 23:59
UPDATE "Task" SET "dueAt" = 1792450740000, "weekStart" = 1792364400000
WHERE "title" = 'Weekly Quiz 3' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI4021');

-- FP 4: Mon 26 Oct, 23:59
UPDATE "Task" SET "dueAt" = 1793059140000, "weekStart" = 1792972800000
WHERE "title" = 'Weekly Quiz 4' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI4021');

-- FP 5: Mon 2 Nov, 23:59
UPDATE "Task" SET "dueAt" = 1793663940000, "weekStart" = 1793577600000
WHERE "title" = 'Weekly Quiz 5' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI4021');

-- FP 6: Mon 9 Nov, 23:59
UPDATE "Task" SET "dueAt" = 1794268740000, "weekStart" = 1794182400000
WHERE "title" = 'Weekly Quiz 6' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI4021');

-- FP 7: Mon 16 Nov, 23:59
UPDATE "Task" SET "dueAt" = 1794873540000, "weekStart" = 1794787200000
WHERE "title" = 'Weekly Quiz 7' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI4021');

-- FP 8: Mon 23 Nov, 23:59
UPDATE "Task" SET "dueAt" = 1795478340000, "weekStart" = 1795392000000
WHERE "title" = 'Weekly Quiz 8' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI4021');

-- FP 9: Mon 30 Nov, 23:59
UPDATE "Task" SET "dueAt" = 1796083140000, "weekStart" = 1795996800000
WHERE "title" = 'Weekly Quiz 9' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI4021');

-- FP 10: Mon 7 Dec, 23:59
UPDATE "Task" SET "dueAt" = 1796687940000, "weekStart" = 1796601600000
WHERE "title" = 'Weekly Quiz 10' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI4021');

-- Coaching has nine quizzes, not ten.
UPDATE "Task" SET "cancelled" = true
WHERE "title" = 'Weekly Quiz 10' AND "courseId" IN (SELECT "id" FROM "Course" WHERE "code" = 'COMPSCI5113');
