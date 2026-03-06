import {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type Router as RouterType,
} from 'express';
import { z } from 'zod';

import { encrypt, isEncryptionAvailable } from '../../lib/encryption.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { parseStreamPlatforms, parseCustomButtons } from '../../lib/streamPlatforms.js';
import { isValidUrl } from '../../lib/urlValidation.js';
import { validateBotToken } from '../../services/resolveProvider.js';
import { TEMPLATE_VARIABLE_DOCS } from '../../services/templateService.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/types.js';
import { validate } from '../middleware/validation.js';

const router: RouterType = Router();

router.use(requireAuth);

// ─── Validation Schemas ──────────────────────────────────

const safeUrl = z
  .string()
  .url()
  .max(500)
  .refine((val) => isValidUrl(val), {
    message: 'URL must use https:// and point to a public host',
  });

const streamPlatformSchema = z.object({
  platform: z.enum(['twitch', 'youtube', 'vk', 'kick', 'trovo', 'other']),
  login: z.string().min(1).max(200),
  url: safeUrl,
  isManual: z.boolean(),
});

const customButtonSchema = z.object({
  label: z.string().min(1).max(100),
  url: safeUrl,
});

const updateSettingsSchema = z
  .object({
    streamPlatforms: z.array(streamPlatformSchema).max(20).optional(),
    customButtons: z.array(customButtonSchema).max(20).nullable().optional(),
    defaultTemplate: z.string().max(2000).nullable().optional(),
    customBotToken: z
      .string()
      .regex(/^\d+:[A-Za-z0-9_-]+$/, 'Invalid bot token format')
      .nullable()
      .optional(),
    photoType: z.enum(['stream_preview', 'game_box_art', 'none']).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

// ─── Routes ──────────────────────────────────────────────

/**
 * GET /api/streamer/settings — Get streamer's announcement settings.
 */
router.get('/settings', async (req: Request, res: Response, next: NextFunction) => {
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
        photoType: true,
      },
    });

    if (!dbStreamer) {
      throw AppError.notFound('Streamer');
    }

    res.json({
      settings: {
        streamPlatforms: parseStreamPlatforms(dbStreamer.streamPlatforms),
        customButtons: parseCustomButtons(dbStreamer.customButtons),
        defaultTemplate: dbStreamer.defaultTemplate,
        templateVariables: TEMPLATE_VARIABLE_DOCS,
        customBotUsername: dbStreamer.customBotUsername ?? null,
        hasCustomBot: !!dbStreamer.customBotToken,
        photoType: dbStreamer.photoType,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/streamer/settings — Update streamer's announcement settings.
 */
router.patch(
  '/settings',
  validate(updateSettingsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { streamer } = req as AuthenticatedRequest;
      const { streamPlatforms, customButtons, defaultTemplate, customBotToken, photoType } =
        req.body;

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

      if (photoType !== undefined) {
        data.photoType = photoType;
      }

      // Handle custom bot token
      if (customBotToken !== undefined) {
        if (customBotToken === null) {
          // Remove custom bot — clear lastMessageId since global bot cannot delete messages sent by the custom bot
          data.customBotToken = null;
          data.customBotUsername = null;
          await prisma.connectedChat.updateMany({
            where: { streamerId: streamer.id },
            data: { lastMessageId: null },
          });
        } else {
          // Validate encryption is available
          if (!isEncryptionAvailable()) {
            throw AppError.badRequest('Custom bot feature is not configured on this server');
          }

          // Validate the token by calling Telegram getMe
          const botInfo = await Promise.race([
            validateBotToken(customBotToken),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Bot token validation timed out')), 5000),
            ),
          ]).catch(() => {
            throw AppError.badRequest(
              'Invalid bot token. Make sure the token is correct and the bot exists.',
            );
          });
          data.customBotToken = encrypt(customBotToken);
          data.customBotUsername = botInfo.username ?? botInfo.first_name;
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
          photoType: true,
        },
        data,
      });

      res.json({
        settings: {
          streamPlatforms: parseStreamPlatforms(updated.streamPlatforms),
          customButtons: parseCustomButtons(updated.customButtons),
          defaultTemplate: updated.defaultTemplate,
          templateVariables: TEMPLATE_VARIABLE_DOCS,
          customBotUsername: updated.customBotUsername ?? null,
          hasCustomBot: !!updated.customBotToken,
          photoType: updated.photoType,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export { router as streamerRouter };
