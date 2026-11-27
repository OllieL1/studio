-- When each pause happened, so music played during one isn't counted.
ALTER TABLE "ActiveTimer" ADD COLUMN "pauses" TEXT;
