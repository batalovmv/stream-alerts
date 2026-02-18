/**
 * Shared bot UI components — menus, keyboards, navigation.
 *
 * All screens use editMessageText for in-place navigation.
 * Every sub-screen includes a "◀️ Меню" button to return to main menu.
 */

import * as tg from '../providers/telegram/telegramApi.js';
import { prisma } from '../lib/prisma.js';
import { escapeHtml } from '../lib/escapeHtml.js';

// ─── Main Menu ───────────────────────────────────────────

const MAIN_MENU_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '\u{1F4E1} Подключить', callback_data: 'menu:connect' },
      { text: '\u{1F4CB} Каналы', callback_data: 'menu:channels' },
    ],
    [
      { text: '\u{2699}\u{FE0F} Настройки', callback_data: 'menu:settings' },
      { text: '\u{1F4E3} Тест', callback_data: 'menu:test' },
    ],
    [
      { text: '\u{1F441} Предпросмотр', callback_data: 'menu:preview' },
      { text: '\u{1F4CA} Статистика', callback_data: 'menu:stats' },
    ],
    [
      { text: '\u{1F310} Дашборд', url: 'https://notify.memelab.ru/dashboard' },
    ],
  ],
};

/** Build the main menu text for a streamer */
export function buildMainMenuText(displayName: string): string {
  return [
    '\u{1F7E3} <b>MemeLab Notify</b>',
    '',
    `\u{1F464} <b>${escapeHtml(displayName)}</b>`,
  ].join('\n');
}

/** Get the main menu keyboard */
export function getMainMenuKeyboard() {
  return MAIN_MENU_KEYBOARD;
}

/** Send main menu as a NEW message */
export async function sendMainMenu(chatId: number, displayName: string): Promise<void> {
  await tg.sendMessage({
    chatId: String(chatId),
    text: buildMainMenuText(displayName),
    replyMarkup: MAIN_MENU_KEYBOARD,
  });
}

/** Edit an existing message to show main menu */
export async function editToMainMenu(chatId: number, messageId: number, userId: number): Promise<void> {
  const streamer = await prisma.streamer.findUnique({
    where: { telegramUserId: String(userId) },
  });

  if (!streamer) return;

  await tg.editMessageText({
    chatId: String(chatId),
    messageId,
    text: buildMainMenuText(streamer.displayName),
    replyMarkup: MAIN_MENU_KEYBOARD,
  });
}

// ─── Back Button Helpers ─────────────────────────────────

/** Single "back to menu" button row */
export const BACK_TO_MENU_ROW = [{ text: '\u{25C0}\u{FE0F} \u041C\u0435\u043D\u044E', callback_data: 'menu:main' }];

/** Append "back to menu" row to any keyboard */
export function withBackToMenu(keyboard: Array<Array<{ text: string; callback_data: string }>>): Array<Array<{ text: string; callback_data: string }>> {
  return [...keyboard, BACK_TO_MENU_ROW];
}
