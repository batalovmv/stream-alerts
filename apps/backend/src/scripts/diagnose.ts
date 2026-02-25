/**
 * Diagnostic script — run on server to find why notifications aren't sent.
 * Usage: npx tsx src/scripts/diagnose.ts [channelId]
 */
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { config } from '../lib/config.js';

const prisma = new PrismaClient();

async function main() {
  const channelId = process.argv[2];

  console.log('\n=== MemeLab Notify — Diagnostic ===\n');

  // 1. Check provider env vars
  console.log('--- Environment ---');
  console.log('TELEGRAM_BOT_TOKEN:', config.telegramBotToken ? '✅ SET' : '❌ MISSING');
  console.log('WEBHOOK_SECRET:', config.webhookSecret ? '✅ SET' : '❌ MISSING');
  console.log('DATABASE_URL:', config.databaseUrl ? '✅ SET' : '❌ MISSING');
  console.log('REDIS_URL:', config.redisUrl ?? 'redis://localhost:6379 (default)');

  // 2. DB check — streamers
  console.log('\n--- Streamers in DB ---');
  const streamers = await prisma.streamer.findMany({
    include: { chats: true },
  });

  if (streamers.length === 0) {
    console.log('❌ NO streamers found in database!');
  } else {
    for (const s of streamers) {
      const enabledChats = s.chats.filter((c) => c.enabled);
      console.log(`\nStreamer: ${s.displayName}`);
      console.log(`  memelabChannelId: ${s.memelabChannelId}`);
      console.log(`  telegramUserId:   ${s.telegramUserId ?? '❌ NOT SET (no personal notifications!)'}`);
      console.log(`  Total chats:      ${s.chats.length}`);
      console.log(`  Enabled chats:    ${enabledChats.length}`);

      if (enabledChats.length === 0 && s.chats.length > 0) {
        console.log('  ⚠️  All chats are DISABLED (bot was probably kicked/blocked)');
      }

      for (const chat of s.chats) {
        const status = chat.enabled ? '✅' : '❌ disabled';
        console.log(`    ${status} [${chat.provider}] ${chat.chatTitle ?? chat.chatId}`);
      }
    }
  }

  // 3. If channelId provided — specific check
  if (channelId) {
    console.log(`\n--- Specific check for channelId: ${channelId} ---`);
    const streamer = await prisma.streamer.findUnique({
      where: { memelabChannelId: channelId },
      include: { chats: true },
    });

    if (!streamer) {
      console.log('❌ Streamer NOT FOUND with this channelId!');
      console.log('   Existing channelIds:', streamers.map((s) => s.memelabChannelId).join(', '));
    } else {
      console.log('✅ Streamer found:', streamer.displayName);

      // Check Redis for active session
      const redis = new Redis(config.redisUrl);

      const sessionKey = `announce:session:${channelId}`;
      const session = await redis.get(sessionKey);
      console.log(`\n  Redis session key (${sessionKey}):`, session ?? 'NOT SET');

      if (session) {
        // Check for dedup locks
        for (const chat of streamer.chats) {
          const lockKey = `announce:lock:${chat.id}:${session}`;
          const lock = await redis.get(lockKey);
          if (lock) {
            const ttl = await redis.ttl(lockKey);
            console.log(`  ⚠️  Dedup lock on chat ${chat.chatId}: holder=${lock}, TTL=${ttl}s`);
          }
        }

        // Check notification flag
        const notifyKey = `announce:notified:${streamer.id}:${session}`;
        const notified = await redis.get(notifyKey);
        console.log(`  Streamer notified flag: ${notified ? `✅ SET (already notified)` : 'NOT SET'}`);
      }

      // Check recent announcement logs
      const logs = await prisma.announcementLog.findMany({
        where: { chatId: { in: streamer.chats.map((c) => c.id) } },
        orderBy: { sentAt: 'desc' },
        take: 10,
      });

      console.log(`\n  Recent announcement logs (last 10):`);
      if (logs.length === 0) {
        console.log('  ❌ NO logs found — no announcements ever sent or logged');
      } else {
        for (const log of logs) {
          const chat = streamer.chats.find((c) => c.id === log.chatId);
          const date = log.sentAt ? log.sentAt.toISOString() : 'no date';
          const status = log.status === 'sent' ? '✅' : '❌';
          console.log(`  ${status} [${date}] ${chat?.chatTitle ?? log.chatId} — ${log.status}${log.error ? ` (${log.error})` : ''}`);
        }
      }

      await redis.quit();
    }
  }

  // 4. Validate webhook format (simulate what MemeLab backend should send)
  console.log('\n--- Webhook format check ---');
  console.log('Required POST /api/webhooks/stream body for stream.online:');
  console.log(JSON.stringify({
    event: 'stream.online',
    channelId: '<memelabChannelId from DB>',
    channelSlug: 'alphanumeric-slug',
    twitchLogin: 'optionalTwitchLogin',
    streamTitle: 'Stream title',
    startedAt: new Date().toISOString(), // MUST include timezone (Z or +HH:MM)
  }, null, 2));
  console.log('\n⚠️  startedAt MUST have timezone offset (Z or +HH:MM) — bare "2024-01-01T12:00:00" fails!');

  console.log('\n=== Done ===\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
