-- Phone Focus mode via Pushcut: two links (session on, session off) and a switch.
ALTER TABLE "Preference" ADD COLUMN "pushcutOn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Preference" ADD COLUMN "pushcutStartUrl" TEXT;
ALTER TABLE "Preference" ADD COLUMN "pushcutEndUrl" TEXT;
