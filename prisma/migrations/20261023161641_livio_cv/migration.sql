-- CreateTable
CREATE TABLE "CvMaster" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "doc" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CvVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "overrides" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CareerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "role" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "status" TEXT NOT NULL,
    "statusChangedAt" DATETIME,
    "sentAt" DATETIME,
    "link" TEXT,
    "deadline" DATETIME,
    "notesMd" TEXT,
    "cvVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CareerEntry_cvVersionId_fkey" FOREIGN KEY ("cvVersionId") REFERENCES "CvVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CareerEntry" ("company", "contactEmail", "contactName", "createdAt", "deadline", "id", "link", "notesMd", "role", "sentAt", "status", "statusChangedAt", "type", "updatedAt") SELECT "company", "contactEmail", "contactName", "createdAt", "deadline", "id", "link", "notesMd", "role", "sentAt", "status", "statusChangedAt", "type", "updatedAt" FROM "CareerEntry";
DROP TABLE "CareerEntry";
ALTER TABLE "new_CareerEntry" RENAME TO "CareerEntry";
CREATE INDEX "CareerEntry_status_idx" ON "CareerEntry"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
