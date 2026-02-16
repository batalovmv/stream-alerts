/**
 * Announcement template engine.
 *
 * Renders announcement text by replacing {variables} with actual values.
 */

const DEFAULT_ONLINE_TEMPLATE = [
  '🔴 <b>Стрим начался!</b>',
  '',
  '{streamer_name} сейчас в эфире',
  '📺 {stream_title}',
  '🎮 {game_name}',
].join('\n');

const DEFAULT_OFFLINE_TEMPLATE = '⚫ <b>Стрим завершён</b>\n\nСпасибо за просмотр! 👋';

export interface TemplateVariables {
  streamer_name: string;
  stream_title?: string;
  game_name?: string;
  stream_url?: string;
  memelab_url?: string;
  viewer_count?: string;
}

/** Render a template, replacing {var} placeholders with values. */
export function renderTemplate(template: string | null | undefined, vars: TemplateVariables): string {
  const tpl = template?.trim() || DEFAULT_ONLINE_TEMPLATE;

  return tpl.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key as keyof TemplateVariables];
    return value ?? '';
  });
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

/** Render offline announcement text. */
export function renderOfflineTemplate(template?: string | null): string {
  return template?.trim() || DEFAULT_OFFLINE_TEMPLATE;
}
