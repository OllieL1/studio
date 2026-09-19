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
    "repoUrl" TEXT,
    "hoursTarget" INTEGER,
    "isProject" BOOLEAN NOT NULL DEFAULT false,
    "credits" INTEGER NOT NULL DEFAULT 10,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Course" ("archived", "assessmentWeight", "code", "colour", "createdAt", "hoursTarget", "id", "isProject", "labWeight", "lectureWeight", "name", "position", "repoUrl", "revisionMode", "semester", "shortName", "updatedAt") SELECT "archived", "assessmentWeight", "code", "colour", "createdAt", "hoursTarget", "id", "isProject", "labWeight", "lectureWeight", "name", "position", "repoUrl", "revisionMode", "semester", "shortName", "updatedAt" FROM "Course";
DROP TABLE "Course";
ALTER TABLE "new_Course" RENAME TO "Course";
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
