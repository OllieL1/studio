-- CreateTable
CREATE TABLE "CareerEntry" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "CareerEntry_status_idx" ON "CareerEntry"("status");
