-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PhotoType" AS ENUM ('stream_preview', 'game_box_art', 'none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Streamer" ADD COLUMN IF NOT EXISTS "photoType" "PhotoType" NOT NULL DEFAULT 'stream_preview';
