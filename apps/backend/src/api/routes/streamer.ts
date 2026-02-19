import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { parseStreamPlatforms, parseCustomButtons } from '../../lib/streamPlatforms.js';
import { TEMPLATE_VARIABLE_DOCS } from '../../services/templateService.js';
import { encrypt, isEncryptionAvailable } from '../../lib/encryption.js';
import { getMeWithToken } from '../../providers/telegram/telegramApi.js';
import type { AuthenticatedRequest } from '../middleware/types.js';

const router: RouterType = Router();

router.use(requireAuth);

// ─── Validation Schemas ──────────────────────────────────

const streamPlatformSchema = z.object({
  platform: z.enum(['twitch', 'youtube', 'vk', 'kick', 'other']),
  login: z.string().min(1).max(200),
  url: z.string().url().max(500),
  isManual: z.boolean(),
});

const customButtonSchema = z.object({
  label: z.string().min(1).max(100),
  url: z.string().min(1).max(500),
});

const updateSettingsSchema = z.object({
  streamPlatforms: z.array(streamPlatformSchema).max(20).optional(),
  customButtons: z.array(customButtonSchema).max(20).nullable().optional(),
  defaultTemplate: z.string().max(2000).nullable().optional(),
  customBotToken: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/, 'Invalid bot token format').nullable().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' },
);

// ─── Routes ──────────────────────────────────────────────

/**
 * GET /api/streamer/settings — Get streamer's announcement settings.
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const { streamer } = req as AuthenticatedRequest;

    const dbStreamer = await prisma.streamer.findUnique({
      where: { id: streamer.id },
      select: {
        streamPlatforms: true,
        customButtons: true,
        defaultTemplate: true,
        customBotUsername: true,
        customBotToken: true,
      },
    });

    if (!dbStreamer) {
      res.status(404).json({ error: 'Streamer not found' });
      return;
    }

    res.json({
      streamPlatforms: parseStreamPlatforms(dbStreamer.streamPlatforms),
      customButtons: parseCustomButtons(dbStreamer.customButtons),
      defaultTemplate: dbStreamer.defaultTemplate,
      templateVariables: TEMPLATE_VARIABLE_DOCS,
      customBotUsername: dbStreamer.customBotUsername ?? null,
      hasCustomBot: !!dbStreamer.customBotToken,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errMsg }, 'streamer.settings_get_failed');
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

/**
 * PATCH /api/streamer/settings — Update streamer's announcement settings.
 */
router.patch('/settings', validate(updateSettingsSchema), async (req: Request, res: Response) => {
  try {
    const { streamer } = req as AuthenticatedRequest;
    const { streamPlatforms, customButtons, defaultTemplate, customBotToken } = req.body;

    const data: Record<string, unknown> = {};

    if (streamPlatforms !== undefined) {
      data.streamPlatforms = streamPlatforms;

      // Also sync twitchLogin for backward compatibility
      const twitchPlatform = streamPlatforms.find(
        (p: { platform: string }) => p.platform === 'twitch',
      );
      data.twitchLogin = twitchPlatform?.login ?? null;
    }

    if (customButtons !== undefined) {
      data.customButtons = customButtons;
    }

    if (defaultTemplate !== undefined) {
      data.defaultTemplate = defaultTemplate;
    }

    // Handle custom bot token
    if (customBotToken !== undefined) {
      if (customBotToken === null) {
        // Remove custom bot
        data.customBotToken = null;
        data.customBotUsername = null;
      } else {
        // Validate encryption is available
        if (!isEncryptionAvailable()) {
          res.status(400).json({ error: 'Custom bot feature is not configured on this server' });
          return;
        }

        // Validate the token by calling Telegram getMe
        try {
          const botInfo = await getMeWithToken(customBotToken);
          data.customBotToken = encrypt(customBotToken);
          data.customBotUsername = botInfo.username ?? botInfo.first_name;
          logger.info(
            { streamerId: streamer.id, botUsername: data.customBotUsername },
            'streamer.custom_bot_validated',
          );
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.warn({ streamerId: streamer.id, error: errMsg }, 'streamer.custom_bot_invalid');
          res.status(400).json({ error: 'Invalid bot token. Make sure the token is correct and the bot exists.' });
          return;
        }
      }
    }

    const updated = await prisma.streamer.update({
      where: { id: streamer.id },
      select: {
        streamPlatforms: true,
        customButtons: true,
        defaultTemplate: true,
        customBotUsername: true,
        customBotToken: true,
      },
      data,
    });

    logger.info(
      { streamerId: streamer.id, fields: Object.keys(data) },
      'streamer.settings_updated',
    );

    res.json({
      streamPlatforms: parseStreamPlatforms(updated.streamPlatforms),
      customButtons: parseCustomButtons(updated.customButtons),
      defaultTemplate: updated.defaultTemplate,
      customBotUsername: updated.customBotUsername ?? null,
      hasCustomBot: !!updated.customBotToken,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errMsg }, 'streamer.settings_update_failed');
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export { router as streamerRouter };
