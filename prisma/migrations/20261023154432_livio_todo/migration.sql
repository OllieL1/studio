-- AlterTable
ALTER TABLE "Task" ADD COLUMN "notionPageId" TEXT;

-- CreateTable
CREATE TABLE "NotionInboxItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" DATETIME,
    "courseId" TEXT,
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "toCalendar" BOOLEAN NOT NULL DEFAULT false,
    "pulledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NotionAuth" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "token" TEXT NOT NULL,
    "databaseId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "title" TEXT,
    "statusType" TEXT NOT NULL DEFAULT 'status',
    "lastPulledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NotionAuth" ("createdAt", "dataSourceId", "databaseId", "id", "lastPulledAt", "title", "token", "updatedAt") SELECT "createdAt", "dataSourceId", "databaseId", "id", "lastPulledAt", "title", "token", "updatedAt" FROM "NotionAuth";
DROP TABLE "NotionAuth";
ALTER TABLE "new_NotionAuth" RENAME TO "NotionAuth";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "NotionInboxItem_pageId_key" ON "NotionInboxItem"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_notionPageId_key" ON "Task"("notionPageId");

