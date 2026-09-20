-- Existing notes predate the notesAt column; the row's last edit is the best
-- date we have for them, and it beats showing no date at all.
UPDATE "Paper" SET "notesAt" = "updatedAt" WHERE "notes" IS NOT NULL AND TRIM("notes") <> '' AND "notesAt" IS NULL;
