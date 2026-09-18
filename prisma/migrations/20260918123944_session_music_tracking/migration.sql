-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    "minutes" INTEGER NOT NULL,
    "rawMinutes" INTEGER NOT NULL,
    "focus" INTEGER NOT NULL,
    "notes" TEXT,
    "musicTracked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Session" ("createdAt", "endedAt", "focus", "id", "minutes", "name", "notes", "rawMinutes", "startedAt") SELECT "createdAt", "endedAt", "focus", "id", "minutes", "name", "notes", "rawMinutes", "startedAt" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE INDEX "Session_startedAt_idx" ON "Session"("startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
