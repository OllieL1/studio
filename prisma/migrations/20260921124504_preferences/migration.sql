-- CreateTable
CREATE TABLE "Preference" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "theme" TEXT NOT NULL DEFAULT 'auto',
    "darkFrom" INTEGER NOT NULL DEFAULT 21,
    "darkTo" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" DATETIME NOT NULL
);
