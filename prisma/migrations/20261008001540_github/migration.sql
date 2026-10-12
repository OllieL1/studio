-- CreateTable
CREATE TABLE "GitHubAuth" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "token" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "name" TEXT,
    "scopes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Repo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GitHubCache" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "etag" TEXT,
    "body" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TaskIssue" (
    "taskId" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "closedAt" DATETIME,
    "linkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("taskId", "repo", "number"),
    CONSTRAINT "TaskIssue_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Repo_fullName_key" ON "Repo"("fullName");

-- CreateIndex
CREATE INDEX "TaskIssue_repo_number_idx" ON "TaskIssue"("repo", "number");

-- The repos the menu starts with (more are added in Settings). Inserted by
-- the migration rather than the seed, because the stick's database is only
-- ever migrated, never re-seeded.
INSERT OR IGNORE INTO "Repo" ("id", "fullName", "label", "position", "createdAt") VALUES
  ('repo_coaching', 'uog-cose/socs-coaching-software-teams-2026-2756026l-livingston', 'Coaching', 0, CURRENT_TIMESTAMP),
  ('repo_sh28_project', 'uog-cose/socs-team-project-3-h-2026-sh28-project', 'SH28 Project', 1, CURRENT_TIMESTAMP),
  ('repo_sh28_diss', 'uog-cose/socs-team-project-3-h-2026-sh28-dissertation', 'SH28 Diss', 2, CURRENT_TIMESTAMP);

-- The project's repo, unless one has already been linked from the project page.
UPDATE "Course" SET "repoUrl" = 'https://github.com/uog-cose/MCR-5082P'
  WHERE "isProject" = true AND ("repoUrl" IS NULL OR "repoUrl" = '');
