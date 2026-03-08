/**
 * Diagnostic script — run on server to find why notifications aren't sent.
 * Usage: npx tsx src/scripts/diagnose.ts [channelId]
 */
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

import { config } from '../lib/config.js';

const prisma = new PrismaClient();

function printLine(message = '') {
  process.stdout.write(`${message}\n`);
}

function printJson(value: unknown) {
  printLine(JSON.stringify(value, null, 2));
}

async function main() {
  const channelId = process.argv[2];

  printLine('\n=== MemeLab Notify — Diagnostic ===\n');

  // 1. Check provider env vars
  printLine('--- Environment ---');
  printLine(`TELEGRAM_BOT_TOKEN: ${config.telegramBotToken ? '✅ SET' : '❌ MISSING'}`);
  printLine(`WEBHOOK_SECRET: ${config.webhookSecret ? '✅ SET' : '❌ MISSING'}`);
  printLine(`DATABASE_URL: ${config.databaseUrl ? '✅ SET' : '❌ MISSING'}`);
  printLine(`REDIS_URL: ${config.redisUrl ?? 'redis://localhost:6379 (default)'}`);

  // 2. DB check — streamers
  printLine('\n--- Streamers in DB ---');
  const streamers = await prisma.streamer.findMany({
    include: { chats: true },
    take: 100,
  });

  if (streamers.length === 0) {
    printLine('❌ NO streamers found in database!');
  } else {
    for (const s of streamers) {
      const enabledChats = s.chats.filter((c) => c.enabled);
      printLine(`\nStreamer: ${s.displayName}`);
      printLine(`  memelabChannelId: ${s.memelabChannelId}`);
      printLine(
        `  telegramUserId:   ${s.telegramUserId ?? '❌ NOT SET (no personal notifications!)'}`,
      );
      printLine(`  Total chats:      ${s.chats.length}`);
      printLine(`  Enabled chats:    ${enabledChats.length}`);

      if (enabledChats.length === 0 && s.chats.length > 0) {
        printLine('  ⚠️  All chats are DISABLED (bot was probably kicked/blocked)');
      }

      for (const chat of s.chats) {
        const status = chat.enabled ? '✅' : '❌ disabled';
        printLine(`    ${status} [${chat.provider}] ${chat.chatTitle ?? chat.chatId}`);
      }
    }
  }

  // 3. If channelId provided — specific check
  if (channelId) {
    printLine(`\n--- Specific check for channelId: ${channelId} ---`);
    const streamer = await prisma.streamer.findUnique({
      where: { memelabChannelId: channelId },
      include: { chats: true },
    });

    if (!streamer) {
      printLine('❌ Streamer NOT FOUND with this channelId!');
      printLine(`   Existing channelIds: ${streamers.map((s) => s.memelabChannelId).join(', ')}`);
    } else {
      printLine(`✅ Streamer found: ${streamer.displayName}`);

      // Check Redis for active session
      const redis = new Redis(config.redisUrl);

      const sessionKey = `announce:session:${channelId}`;
      const session = await redis.get(sessionKey);
      printLine(`\n  Redis session key (${sessionKey}): ${session ?? 'NOT SET'}`);

      if (session) {
        // Check for dedup locks
        for (const chat of streamer.chats) {
          const lockKey = `announce:lock:${chat.id}:${session}`;
          const lock = await redis.get(lockKey);
          if (lock) {
            const ttl = await redis.ttl(lockKey);
            printLine(`  ⚠️  Dedup lock on chat ${chat.chatId}: holder=${lock}, TTL=${ttl}s`);
          }
        }

        // Check notification flag
        const notifyKey = `announce:notified:${streamer.id}:${session}`;
        const notified = await redis.get(notifyKey);
        printLine(
          `  Streamer notified flag: ${notified ? '✅ SET (already notified)' : 'NOT SET'}`,
        );
      }

      // Check recent announcement logs
      const logs = await prisma.announcementLog.findMany({
        where: { chatId: { in: streamer.chats.map((c) => c.id) } },
        orderBy: { sentAt: 'desc' },
        take: 10,
      });

      printLine('\n  Recent announcement logs (last 10):');
      if (logs.length === 0) {
        printLine('  ❌ NO logs found — no announcements ever sent or logged');
      } else {
        for (const log of logs) {
          const chat = streamer.chats.find((c) => c.id === log.chatId);
          const date = log.sentAt ? log.sentAt.toISOString() : 'no date';
          const status = log.status === 'sent' ? '✅' : '❌';
          printLine(
            `  ${status} [${date}] ${chat?.chatTitle ?? log.chatId} — ${log.status}${log.error ? ` (${log.error})` : ''}`,
          );
        }
      }

      await redis.quit();
    }
  }

  // 4. Validate webhook format (simulate what MemeLab backend should send)
  printLine('\n--- Webhook format check ---');
  printLine('Required POST /api/webhooks/stream body for stream.online:');
  printJson({
    event: 'stream.online',
    channelId: '<memelabChannelId from DB>',
    channelSlug: 'alphanumeric-slug',
    twitchLogin: 'optionalTwitchLogin',
    streamTitle: 'Stream title',
    startedAt: new Date().toISOString(),
  });
  printLine(
    '\n⚠️  startedAt MUST have timezone offset (Z or +HH:MM) — bare "2024-01-01T12:00:00" fails!',
  );

  printLine('\n=== Done ===\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
