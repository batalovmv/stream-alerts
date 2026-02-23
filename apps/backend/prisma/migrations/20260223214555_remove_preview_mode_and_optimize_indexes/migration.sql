-- CreateEnum
CREATE TYPE "MessengerProvider" AS ENUM ('telegram', 'max');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('queued', 'sent', 'deleted', 'failed');

-- CreateTable
CREATE TABLE "Streamer" (
    "id" TEXT NOT NULL,
    "memelabUserId" TEXT NOT NULL,
    "memelabChannelId" TEXT NOT NULL,
    "channelSlug" TEXT NOT NULL DEFAULT '',
    "twitchLogin" TEXT,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "defaultTemplate" TEXT,
    "streamPlatforms" JSONB,
    "customButtons" JSONB,
    "customBotToken" TEXT,
    "customBotUsername" TEXT,
    "telegramUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Streamer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedChat" (
    "id" TEXT NOT NULL,
    "streamerId" TEXT NOT NULL,
    "provider" "MessengerProvider" NOT NULL,
    "chatId" TEXT NOT NULL,
    "chatTitle" TEXT,
    "chatType" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "deleteAfterEnd" BOOLEAN NOT NULL DEFAULT false,
    "customTemplate" TEXT,
    "lastMessageId" TEXT,
    "lastAnnouncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementLog" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "streamSessionId" TEXT,
    "provider" "MessengerProvider" NOT NULL,
    "providerMsgId" TEXT,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AnnouncementLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Streamer_memelabUserId_key" ON "Streamer"("memelabUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Streamer_memelabChannelId_key" ON "Streamer"("memelabChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "Streamer_telegramUserId_key" ON "Streamer"("telegramUserId");

-- CreateIndex
CREATE INDEX "Streamer_twitchLogin_idx" ON "Streamer"("twitchLogin");

-- CreateIndex
CREATE INDEX "ConnectedChat_streamerId_enabled_idx" ON "ConnectedChat"("streamerId", "enabled");

-- CreateIndex
CREATE INDEX "ConnectedChat_provider_chatId_idx" ON "ConnectedChat"("provider", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedChat_streamerId_provider_chatId_key" ON "ConnectedChat"("streamerId", "provider", "chatId");

-- CreateIndex
CREATE INDEX "AnnouncementLog_chatId_status_idx" ON "AnnouncementLog"("chatId", "status");

-- CreateIndex
CREATE INDEX "AnnouncementLog_streamSessionId_idx" ON "AnnouncementLog"("streamSessionId");

-- CreateIndex
CREATE INDEX "AnnouncementLog_status_queuedAt_idx" ON "AnnouncementLog"("status", "queuedAt");

-- AddForeignKey
ALTER TABLE "ConnectedChat" ADD CONSTRAINT "ConnectedChat_streamerId_fkey" FOREIGN KEY ("streamerId") REFERENCES "Streamer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementLog" ADD CONSTRAINT "AnnouncementLog_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ConnectedChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
