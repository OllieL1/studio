-- The enhancement queue (Settings → Enhancements, ⌥Q from anywhere).
CREATE TABLE "Enhancement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'feature',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "app" TEXT NOT NULL DEFAULT 'studio',
    "path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "position" REAL NOT NULL,
    "resolution" TEXT,
    "commit" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Enhancement_number_key" ON "Enhancement"("number");
CREATE INDEX "Enhancement_status_position_idx" ON "Enhancement"("status", "position");
