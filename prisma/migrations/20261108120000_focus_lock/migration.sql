-- Pausing a session, and ultra focus (Studio locked to one course until a set time).
ALTER TABLE "ActiveTimer" ADD COLUMN "pausedAt" DATETIME;
ALTER TABLE "ActiveTimer" ADD COLUMN "pausedMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ActiveTimer" ADD COLUMN "lockCourseId" TEXT;
ALTER TABLE "ActiveTimer" ADD COLUMN "lockUntil" DATETIME;
