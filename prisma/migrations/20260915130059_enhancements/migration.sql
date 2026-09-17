-- AlterTable
ALTER TABLE "Task" ADD COLUMN "calendarEventId" TEXT;
ALTER TABLE "Task" ADD COLUMN "notebook" TEXT;
ALTER TABLE "Task" ADD COLUMN "notebookPages" TEXT;
ALTER TABLE "Task" ADD COLUMN "notesMd" TEXT;

-- CreateTable
CREATE TABLE "GoogleAuth" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "scope" TEXT NOT NULL,
    "email" TEXT,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Course" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "semester" INTEGER NOT NULL DEFAULT 1,
    "revisionMode" BOOLEAN NOT NULL DEFAULT false,
    "lectureWeight" INTEGER NOT NULL DEFAULT 35,
    "labWeight" INTEGER NOT NULL DEFAULT 0,
    "assessmentWeight" INTEGER NOT NULL DEFAULT 65,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Course" ("archived", "assessmentWeight", "code", "colour", "createdAt", "id", "labWeight", "lectureWeight", "name", "position", "shortName", "updatedAt") SELECT "archived", "assessmentWeight", "code", "colour", "createdAt", "id", "labWeight", "lectureWeight", "name", "position", "shortName", "updatedAt" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
