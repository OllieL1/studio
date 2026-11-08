-- The Claude knowledge base: which GitHub repo the Claude tab reads and commits
-- to, and a token for that repo alone (null: use the main GitHub token).
ALTER TABLE "Preference" ADD COLUMN "kbRepo" TEXT;
ALTER TABLE "Preference" ADD COLUMN "kbToken" TEXT;
