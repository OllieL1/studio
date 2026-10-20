-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Preference" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "theme" TEXT NOT NULL DEFAULT 'auto',
    "darkFrom" INTEGER NOT NULL DEFAULT 21,
    "darkTo" INTEGER NOT NULL DEFAULT 7,
    "sleepOn" BOOLEAN NOT NULL DEFAULT true,
    "sleepFrom" INTEGER NOT NULL DEFAULT 0,
    "sleepTo" INTEGER NOT NULL DEFAULT 480,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Preference" ("darkFrom", "darkTo", "id", "sleepFrom", "sleepOn", "sleepTo", "theme", "updatedAt") SELECT "darkFrom", "darkTo", "id", "sleepFrom", "sleepOn", "sleepTo", "theme", "updatedAt" FROM "Preference";
DROP TABLE "Preference";
ALTER TABLE "new_Preference" RENAME TO "Preference";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Sleep now starts at midnight by default. A bedtime still on the old
-- default (01:00) moves with it; one that was chosen is left alone.
UPDATE "Preference" SET "sleepFrom" = 0 WHERE "sleepFrom" = 60;
