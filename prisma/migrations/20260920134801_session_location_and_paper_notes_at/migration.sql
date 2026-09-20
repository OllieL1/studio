-- AlterTable
ALTER TABLE "Paper" ADD COLUMN "notesAt" DATETIME;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "location" TEXT;
ALTER TABLE "Session" ADD COLUMN "locationNote" TEXT;
