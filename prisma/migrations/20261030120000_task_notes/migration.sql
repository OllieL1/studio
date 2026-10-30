-- Notes can belong to a task (its Files tab). Task notes stay out of Nexus.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "body" TEXT NOT NULL DEFAULT '',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "courseId" TEXT,
    "taskId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Note_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("body", "courseId", "createdAt", "id", "pinned", "title", "updatedAt") SELECT "body", "courseId", "createdAt", "id", "pinned", "title", "updatedAt" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE INDEX "Note_pinned_updatedAt_idx" ON "Note"("pinned", "updatedAt");
CREATE INDEX "Note_taskId_idx" ON "Note"("taskId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

