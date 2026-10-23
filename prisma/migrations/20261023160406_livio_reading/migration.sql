-- CreateTable
CREATE TABLE "ReadingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT '',
    "author" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "rating" REAL,
    "link" TEXT,
    "takeaway" TEXT,
    "notesMd" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ReadingItem_status_idx" ON "ReadingItem"("status");
