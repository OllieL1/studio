-- AlterTable
ALTER TABLE "SpotifyAuth" ADD COLUMN "scope" TEXT;

-- CreateTable
CREATE TABLE "SessionTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "spotifyId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "artists" TEXT NOT NULL,
    "album" TEXT,
    "imageUrl" TEXT,
    "url" TEXT,
    "startedAt" DATETIME NOT NULL,
    "minutes" REAL NOT NULL,
    CONSTRAINT "SessionTrack_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListeningSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sampledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "spotifyId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "artists" TEXT NOT NULL,
    "album" TEXT,
    "imageUrl" TEXT,
    "url" TEXT,
    "durationMs" INTEGER NOT NULL,
    "progressMs" INTEGER NOT NULL,
    "isPlaying" BOOLEAN NOT NULL
);

-- CreateIndex
CREATE INDEX "SessionTrack_sessionId_idx" ON "SessionTrack"("sessionId");

-- CreateIndex
CREATE INDEX "SessionTrack_artist_idx" ON "SessionTrack"("artist");

-- CreateIndex
CREATE INDEX "ListeningSample_sampledAt_idx" ON "ListeningSample"("sampledAt");
