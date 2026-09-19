-- Mark the dissertation project course, so the live database on the USB stick
-- gets the /project workspace too (the seed only runs on the dev copy).
-- Matched by code, and only if no course has been marked yet.
UPDATE "Course"
SET "isProject" = true, "hoursTarget" = COALESCE("hoursTarget", 400)
WHERE "code" = 'COMPSCI5082'
  AND NOT EXISTS (SELECT 1 FROM "Course" WHERE "isProject" = true);
