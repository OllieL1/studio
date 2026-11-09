-- Uncommitted knowledge-base edits: saved as typed, committed together on ⌘S.
CREATE TABLE "KbDraft" (
    "repo" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "base" TEXT,
    "body" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("repo", "path")
);
