import { describe, it, expect } from 'vitest';
import { renderTemplate, buildDefaultButtons, renderOfflineTemplate } from './templateService.js';

describe('renderTemplate', () => {
  it('replaces all variables in default template', () => {
    const result = renderTemplate(null, {
      streamer_name: 'TestStreamer',
      stream_title: 'Playing Dota 2',
      game_name: 'Dota 2',
    });

    expect(result).toContain('TestStreamer');
    expect(result).toContain('Playing Dota 2');
    expect(result).toContain('Dota 2');
  });

  it('uses custom template when provided', () => {
    const result = renderTemplate('{streamer_name} live now!', {
      streamer_name: 'MyChannel',
    });

    expect(result).toBe('MyChannel live now!');
  });

  it('replaces missing variables with empty string', () => {
    const result = renderTemplate('{streamer_name} - {game_name}', {
      streamer_name: 'Test',
    });

    expect(result).toBe('Test - ');
  });

  it('falls back to default template for empty string', () => {
    const result = renderTemplate('', { streamer_name: 'Test' });
    expect(result).toContain('Test');
    expect(result).toContain('Стрим начался');
  });
});

describe('buildDefaultButtons', () => {
  it('returns both buttons when both urls present', () => {
    const buttons = buildDefaultButtons({
      streamer_name: 'Test',
      stream_url: 'https://twitch.tv/test',
      memelab_url: 'https://memelab.ru/test',
    });

    expect(buttons).toHaveLength(2);
    expect(buttons[0].url).toBe('https://twitch.tv/test');
    expect(buttons[1].url).toBe('https://memelab.ru/test');
  });

  it('returns empty array when no urls', () => {
    const buttons = buildDefaultButtons({ streamer_name: 'Test' });
    expect(buttons).toHaveLength(0);
  });

  it('returns only stream button when memelab_url missing', () => {
    const buttons = buildDefaultButtons({
      streamer_name: 'Test',
      stream_url: 'https://twitch.tv/test',
    });

    expect(buttons).toHaveLength(1);
    expect(buttons[0].label).toContain('Смотреть');
  });
});

describe('renderOfflineTemplate', () => {
  it('returns default offline text when no template', () => {
    const result = renderOfflineTemplate(null);
    expect(result).toContain('Стрим завершён');
  });

  it('uses custom offline template', () => {
    const result = renderOfflineTemplate('Stream is over!');
    expect(result).toBe('Stream is over!');
  });
});
