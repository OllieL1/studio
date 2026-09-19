-- AlterTable
ALTER TABLE "Course" ADD COLUMN "hoursTarget" INTEGER;
ALTER TABLE "Course" ADD COLUMN "repoUrl" TEXT;

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "location" TEXT,
    "agenda" TEXT,
    "notes" TEXT,
    "courseId" TEXT,
    "calendarEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Meeting_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingPrep" (
    "meetingId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,

    PRIMARY KEY ("meetingId", "taskId"),
    CONSTRAINT "MeetingPrep_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingPrep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Paper" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "authors" TEXT NOT NULL,
    "year" INTEGER,
    "venue" TEXT,
    "url" TEXT,
    "doi" TEXT,
    "arxivId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'article',
    "status" TEXT NOT NULL DEFAULT 'to-read',
    "tags" TEXT,
    "notes" TEXT,
    "citeKey" TEXT NOT NULL,
    "courseId" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Paper_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" DATETIME,
    "startMin" INTEGER,
    "endMin" INTEGER,
    "weekStart" DATETIME,
    "gradeWeight" REAL,
    "examDiet" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "notesMd" TEXT,
    "notebook" TEXT,
    "notebookPages" TEXT,
    "calendarEventId" TEXT,
    "startsAt" DATETIME,
    "fromMeetingId" TEXT,
    "doneAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_fromMeetingId_fkey" FOREIGN KEY ("fromMeetingId") REFERENCES "Meeting" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("calendarEventId", "cancelled", "courseId", "createdAt", "doneAt", "dueAt", "endMin", "examDiet", "gradeWeight", "id", "kind", "notebook", "notebookPages", "notes", "notesMd", "priority", "startMin", "title", "updatedAt", "weekStart") SELECT "calendarEventId", "cancelled", "courseId", "createdAt", "doneAt", "dueAt", "endMin", "examDiet", "gradeWeight", "id", "kind", "notebook", "notebookPages", "notes", "notesMd", "priority", "startMin", "title", "updatedAt", "weekStart" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_courseId_idx" ON "Task"("courseId");
CREATE INDEX "Task_dueAt_idx" ON "Task"("dueAt");
CREATE INDEX "Task_weekStart_idx" ON "Task"("weekStart");
CREATE INDEX "Task_kind_idx" ON "Task"("kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Meeting_startAt_idx" ON "Meeting"("startAt");

-- CreateIndex
CREATE INDEX "MeetingPrep_taskId_idx" ON "MeetingPrep"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Paper_citeKey_key" ON "Paper"("citeKey");

-- CreateIndex
CREATE INDEX "Paper_status_idx" ON "Paper"("status");
