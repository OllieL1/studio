-- Sovrano: paid-work time tracking in Livio - projects with USD rates,
-- logged sessions, and a singleton running timer.
CREATE TABLE "SovranoProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "rateCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SovranoProject_name_key" ON "SovranoProject"("name");

CREATE TABLE "SovranoSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME NOT NULL,
    "minutes" INTEGER NOT NULL,
    "rawMinutes" INTEGER NOT NULL,
    "paidAt" DATETIME,
    "paidCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SovranoSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "SovranoProject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SovranoSession_startedAt_idx" ON "SovranoSession"("startedAt");
CREATE INDEX "SovranoSession_projectId_idx" ON "SovranoSession"("projectId");

CREATE TABLE "SovranoTimer" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "startedAt" DATETIME NOT NULL,
    "pausedAt" DATETIME,
    "pausedMs" INTEGER NOT NULL DEFAULT 0
);
