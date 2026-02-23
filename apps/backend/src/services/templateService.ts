/**
 * Announcement template engine.
 *
 * Renders announcement text by replacing {variables} with actual values.
 * Builds inline buttons (default or custom).
 */

import { escapeHtml } from '../lib/escapeHtml.js';
import type { StreamPlatform, CustomButton } from '../lib/streamPlatforms.js';

const DEFAULT_ONLINE_TEMPLATE = [
  '🔴 <b>Стрим начался!</b>',
  '',
  '{streamer_name} сейчас в эфире',
  '📺 {stream_title}',
  '🎮 {game_name}',
].join('\n');

export interface TemplateVariables {
  // Core (always available)
  streamer_name: string;
  stream_title?: string;
  game_name?: string;

  // URLs — computed from platforms
  stream_url?: string;     // primary platform URL
  memelab_url?: string;

  // Per-platform URLs
  twitch_url?: string;
  youtube_url?: string;
  vk_url?: string;
  kick_url?: string;

  // Time
  start_time?: string;     // HH:MM (Moscow)
  start_date?: string;     // "19 февраля"

  // Stats
  viewer_count?: string;

  // Extra
  twitch_login?: string;
  channel_slug?: string;
}

/** All available template variable names with descriptions (for UI). */
export const TEMPLATE_VARIABLE_DOCS: Array<{ name: string; description: string }> = [
  { name: 'streamer_name', description: 'Имя стримера' },
  { name: 'stream_title', description: 'Название стрима' },
  { name: 'game_name', description: 'Игра / категория' },
  { name: 'stream_url', description: 'Ссылка на основную платформу' },
  { name: 'memelab_url', description: 'Ссылка на MemeLab' },
  { name: 'twitch_url', description: 'Ссылка на Twitch' },
  { name: 'youtube_url', description: 'Ссылка на YouTube' },
  { name: 'vk_url', description: 'Ссылка на VK' },
  { name: 'kick_url', description: 'Ссылка на Kick' },
  { name: 'start_time', description: 'Время начала (МСК, HH:MM)' },
  { name: 'start_date', description: 'Дата начала («19 февраля»)' },
  { name: 'viewer_count', description: 'Количество зрителей' },
  { name: 'twitch_login', description: 'Логин Twitch' },
  { name: 'channel_slug', description: 'Slug канала на MemeLab' },
];

/** Render a template, replacing {var} placeholders with HTML-escaped values. */
export function renderTemplate(template: string | null | undefined, vars: TemplateVariables): string {
  const tpl = template?.trim() || DEFAULT_ONLINE_TEMPLATE;

  return tpl.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = vars[key as keyof TemplateVariables];
    return value ? escapeHtml(value) : '';
  });
}

/**
 * Build inline buttons for an announcement.
 *
 * - customButtons = null → default buttons (Watch stream + MemeLab)
 * - customButtons = [] → no buttons
 * - customButtons = [...] → custom buttons with variable substitution in URLs
 */
export function buildButtons(
  vars: TemplateVariables,
  customButtons: CustomButton[] | null,
): Array<{ label: string; url: string }> {
  // Custom buttons: resolve {variables} in label and URL
  if (customButtons !== null) {
    return customButtons
      .map((btn) => ({
        label: resolveVariables(btn.label, vars),
        url: resolveVariables(btn.url, vars),
      }))
      .filter((btn) => btn.url.startsWith('http://') || btn.url.startsWith('https://'));
  }

  // Default buttons
  return buildDefaultButtons(vars);
}

/** Build the default inline buttons for an announcement. */
export function buildDefaultButtons(vars: TemplateVariables): Array<{ label: string; url: string }> {
  const buttons: Array<{ label: string; url: string }> = [];

  if (vars.stream_url) {
    buttons.push({ label: '🔗 Смотреть стрим', url: vars.stream_url });
  }

  if (vars.memelab_url) {
    buttons.push({ label: '📋 MemeLab', url: vars.memelab_url });
  }

  return buttons;
}

/**
 * Format startedAt ISO string into Moscow timezone parts.
 */
export function formatStartTime(startedAt: string | undefined): { start_time?: string; start_date?: string } {
  if (!startedAt) return {};

  try {
    const date = new Date(startedAt);
    if (isNaN(date.getTime())) return {};

    const mskTime = date.toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
    });

    const mskDate = date.toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: 'numeric',
      month: 'long',
    });

    return { start_time: mskTime, start_date: mskDate };
  } catch {
    return {};
  }
}

/**
 * Build template variables from platforms and payload data.
 */
export function buildTemplateVars(opts: {
  displayName: string;
  platforms: StreamPlatform[];
  channelSlug: string;
  twitchLogin: string | null;
  streamTitle?: string;
  gameName?: string;
  startedAt?: string;
  viewerCount?: number;
}): TemplateVariables {
  const { displayName, platforms, channelSlug, twitchLogin, streamTitle, gameName, startedAt, viewerCount } = opts;

  const findUrl = (platform: string) => platforms.find((p) => p.platform === platform)?.url;

  // Primary stream URL: first available by priority
  const primaryUrl =
    findUrl('twitch') ||
    findUrl('youtube') ||
    findUrl('vk') ||
    findUrl('kick') ||
    (twitchLogin ? `https://twitch.tv/${twitchLogin}` : undefined);

  const timeVars = formatStartTime(startedAt);

  return {
    streamer_name: displayName,
    stream_title: streamTitle,
    game_name: gameName,
    stream_url: primaryUrl,
    memelab_url: `https://memelab.ru/${channelSlug}`,
    twitch_url: findUrl('twitch') || (twitchLogin ? `https://twitch.tv/${twitchLogin}` : undefined),
    youtube_url: findUrl('youtube'),
    vk_url: findUrl('vk'),
    kick_url: findUrl('kick'),
    viewer_count: viewerCount != null ? String(viewerCount) : undefined,
    twitch_login: twitchLogin || platforms.find((p) => p.platform === 'twitch')?.login,
    channel_slug: channelSlug,
    ...timeVars,
  };
}

/** Replace {variable} placeholders in a string (no HTML escaping — for URLs and button labels). */
function resolveVariables(str: string, vars: TemplateVariables): string {
  return str.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = vars[key as keyof TemplateVariables];
    return value ?? '';
  });
}
