-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SessionCourse" (
    "sessionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("sessionId", "courseId"),
    CONSTRAINT "SessionCourse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SessionCourse" ("courseId", "sessionId") SELECT "courseId", "sessionId" FROM "SessionCourse";
DROP TABLE "SessionCourse";
ALTER TABLE "new_SessionCourse" RENAME TO "SessionCourse";
CREATE INDEX "SessionCourse_courseId_idx" ON "SessionCourse"("courseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill: existing sessions were recorded as an even split, so preserve
-- exactly that. Integer division drops a remainder of up to (n-1) minutes;
-- the second statement hands that remainder to one subject per session so
-- the slices still sum to Session.minutes.
UPDATE "SessionCourse"
SET "minutes" = (
  SELECT s."minutes" / (SELECT COUNT(*) FROM "SessionCourse" sc2 WHERE sc2."sessionId" = "SessionCourse"."sessionId")
  FROM "Session" s WHERE s."id" = "SessionCourse"."sessionId"
);

UPDATE "SessionCourse"
SET "minutes" = "minutes" + (
  SELECT s."minutes" - (SELECT COALESCE(SUM(sc2."minutes"), 0) FROM "SessionCourse" sc2 WHERE sc2."sessionId" = "SessionCourse"."sessionId")
  FROM "Session" s WHERE s."id" = "SessionCourse"."sessionId"
)
WHERE "courseId" = (
  SELECT sc3."courseId" FROM "SessionCourse" sc3
  WHERE sc3."sessionId" = "SessionCourse"."sessionId"
  ORDER BY sc3."courseId" LIMIT 1
);
