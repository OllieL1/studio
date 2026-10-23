-- AlterTable
ALTER TABLE "Course" ADD COLUMN "hasLiterature" BOOLEAN NOT NULL DEFAULT false;

-- Professional Software Issues and Research Methods & Techniques each have a
-- literature review to write, so they get a paper library.
UPDATE "Course" SET "hasLiterature" = true WHERE "code" IN ('COMPSCI4038', 'COMPSCI5025');
