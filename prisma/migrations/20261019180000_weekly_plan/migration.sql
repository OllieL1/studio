-- AlterTable
ALTER TABLE "GoogleAuth" ADD COLUMN "planCalendarId" TEXT;

-- CreateTable
CREATE TABLE "PlanBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "courseId" TEXT,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "calendarEventId" TEXT,
    "calendarId" TEXT,
    "syncedHash" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlanBlock_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanHidden" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PlanBlock_startAt_idx" ON "PlanBlock"("startAt");
