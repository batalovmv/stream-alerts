-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnnouncementLog_chatId_streamSessionId_status_idx" ON "AnnouncementLog"("chatId", "streamSessionId", "status");
