-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PaperTag" (
    "paperId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("paperId", "tagId"),
    CONSTRAINT "PaperTag_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaperTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "body" TEXT NOT NULL DEFAULT '',
    "icon" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "courseId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoteTag" (
    "noteId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("noteId", "tagId"),
    CONSTRAINT "NoteTag_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NoteTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_key_key" ON "Tag"("key");

-- CreateIndex
CREATE INDEX "PaperTag_tagId_idx" ON "PaperTag"("tagId");

-- CreateIndex
CREATE INDEX "Note_pinned_updatedAt_idx" ON "Note"("pinned", "updatedAt");

-- CreateIndex
CREATE INDEX "NoteTag_tagId_idx" ON "NoteTag"("tagId");

-- ── Carry the existing comma-separated tags over ──────────────────────────
-- Paper.tags stays in place, untouched, as a fallback: nothing reads it any
-- more, but losing a year of tags to a bad split would be unrecoverable.

-- One row per (paper, tag).
WITH RECURSIVE split(paperId, tag, rest) AS (
  SELECT id, '', "tags" || ',' FROM "Paper" WHERE "tags" IS NOT NULL AND trim("tags") <> ''
  UNION ALL
  SELECT paperId,
         trim(substr(rest, 1, instr(rest, ',') - 1)),
         substr(rest, instr(rest, ',') + 1)
  FROM split WHERE rest <> ''
)
INSERT INTO "Tag" (id, name, key, createdAt)
SELECT lower(hex(randomblob(12))), min(tag), lower(tag), datetime('now')
FROM split
WHERE tag <> ''
GROUP BY lower(tag);

WITH RECURSIVE split(paperId, tag, rest) AS (
  SELECT id, '', "tags" || ',' FROM "Paper" WHERE "tags" IS NOT NULL AND trim("tags") <> ''
  UNION ALL
  SELECT paperId,
         trim(substr(rest, 1, instr(rest, ',') - 1)),
         substr(rest, instr(rest, ',') + 1)
  FROM split WHERE rest <> ''
)
INSERT OR IGNORE INTO "PaperTag" (paperId, tagId)
SELECT s.paperId, t.id
FROM split s JOIN "Tag" t ON t.key = lower(s.tag)
WHERE s.tag <> '';
