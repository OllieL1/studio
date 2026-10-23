-- CreateTable
CREATE TABLE "NotionAuth" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "token" TEXT NOT NULL,
    "databaseId" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "title" TEXT,
    "lastPulledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
