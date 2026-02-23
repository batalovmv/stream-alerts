-- AlterTable: remove unused previewMode column
ALTER TABLE "Streamer" DROP COLUMN IF EXISTS "previewMode";

-- DropIndex: replace separate indexes with composite
DROP INDEX IF EXISTS "ConnectedChat_streamerId_idx";
DROP INDEX IF EXISTS "ConnectedChat_enabled_idx";

-- CreateIndex: composite index for the main query pattern
CREATE INDEX IF NOT EXISTS "ConnectedChat_streamerId_enabled_idx" ON "ConnectedChat"("streamerId", "enabled");
