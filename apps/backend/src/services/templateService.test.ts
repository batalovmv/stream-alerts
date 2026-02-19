import { describe, it, expect } from 'vitest';
import { renderTemplate, buildDefaultButtons, buildButtons, buildTemplateVars, formatStartTime } from './templateService.js';

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

  it('supports new platform URL variables', () => {
    const result = renderTemplate('Twitch: {twitch_url} YT: {youtube_url}', {
      streamer_name: 'Test',
      twitch_url: 'https://twitch.tv/test',
      youtube_url: 'https://youtube.com/@test',
    });

    expect(result).toBe('Twitch: https://twitch.tv/test YT: https://youtube.com/@test');
  });

  it('supports time variables', () => {
    const result = renderTemplate('Стрим в {start_time}, {start_date}', {
      streamer_name: 'Test',
      start_time: '19:30',
      start_date: '19 февраля',
    });

    expect(result).toBe('Стрим в 19:30, 19 февраля');
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

describe('buildButtons', () => {
  it('returns default buttons when customButtons is null', () => {
    const buttons = buildButtons(
      { streamer_name: 'Test', stream_url: 'https://twitch.tv/test', memelab_url: 'https://memelab.ru/test' },
      null,
    );

    expect(buttons).toHaveLength(2);
    expect(buttons[0].label).toContain('Смотреть');
  });

  it('returns empty array when customButtons is empty array', () => {
    const buttons = buildButtons(
      { streamer_name: 'Test', stream_url: 'https://twitch.tv/test' },
      [],
    );

    expect(buttons).toHaveLength(0);
  });

  it('resolves variables in custom button URLs', () => {
    const buttons = buildButtons(
      { streamer_name: 'Test', twitch_url: 'https://twitch.tv/test', youtube_url: 'https://youtube.com/@test' },
      [
        { label: 'Twitch', url: '{twitch_url}' },
        { label: 'YouTube', url: '{youtube_url}' },
      ],
    );

    expect(buttons).toHaveLength(2);
    expect(buttons[0].url).toBe('https://twitch.tv/test');
    expect(buttons[1].url).toBe('https://youtube.com/@test');
  });

  it('filters out buttons with invalid URLs after resolution', () => {
    const buttons = buildButtons(
      { streamer_name: 'Test' },
      [
        { label: 'Bad', url: '{twitch_url}' }, // resolves to empty string — not http
        { label: 'Good', url: 'https://example.com' },
      ],
    );

    expect(buttons).toHaveLength(1);
    expect(buttons[0].label).toBe('Good');
  });

  it('resolves variables in button labels', () => {
    const buttons = buildButtons(
      { streamer_name: 'Cool Streamer', stream_url: 'https://twitch.tv/test' },
      [{ label: 'Смотреть {streamer_name}', url: 'https://twitch.tv/test' }],
    );

    expect(buttons[0].label).toBe('Смотреть Cool Streamer');
  });
});

describe('formatStartTime', () => {
  it('returns empty object for undefined', () => {
    expect(formatStartTime(undefined)).toEqual({});
  });

  it('returns empty object for invalid date', () => {
    expect(formatStartTime('not-a-date')).toEqual({});
  });

  it('formats valid ISO date to Moscow time', () => {
    const result = formatStartTime('2026-02-19T16:30:00Z');
    expect(result.start_time).toBeDefined();
    expect(result.start_date).toBeDefined();
    // Moscow is UTC+3, so 16:30 UTC = 19:30 MSK
    expect(result.start_time).toBe('19:30');
    expect(result.start_date).toContain('19');
  });
});

describe('buildTemplateVars', () => {
  it('builds all variables from platforms and payload', () => {
    const vars = buildTemplateVars({
      displayName: 'TestStreamer',
      platforms: [
        { platform: 'twitch', login: 'teststreamer', url: 'https://twitch.tv/teststreamer', isManual: false },
        { platform: 'youtube', login: 'testchannel', url: 'https://youtube.com/@testchannel', isManual: true },
      ],
      channelSlug: 'test-channel',
      twitchLogin: 'teststreamer',
      streamTitle: 'Test Stream',
      gameName: 'Minecraft',
      startedAt: '2026-02-19T16:30:00Z',
    });

    expect(vars.streamer_name).toBe('TestStreamer');
    expect(vars.stream_title).toBe('Test Stream');
    expect(vars.game_name).toBe('Minecraft');
    expect(vars.stream_url).toBe('https://twitch.tv/teststreamer');
    expect(vars.twitch_url).toBe('https://twitch.tv/teststreamer');
    expect(vars.youtube_url).toBe('https://youtube.com/@testchannel');
    expect(vars.memelab_url).toBe('https://memelab.ru/test-channel');
    expect(vars.twitch_login).toBe('teststreamer');
    expect(vars.channel_slug).toBe('test-channel');
    expect(vars.start_time).toBeDefined();
    expect(vars.start_date).toBeDefined();
  });

  it('falls back to twitchLogin when no twitch platform', () => {
    const vars = buildTemplateVars({
      displayName: 'Test',
      platforms: [],
      channelSlug: 'test',
      twitchLogin: 'mytwitch',
    });

    expect(vars.twitch_url).toBe('https://twitch.tv/mytwitch');
    expect(vars.stream_url).toBe('https://twitch.tv/mytwitch');
    expect(vars.twitch_login).toBe('mytwitch');
  });

  it('prioritizes platform URL over twitchLogin', () => {
    const vars = buildTemplateVars({
      displayName: 'Test',
      platforms: [
        { platform: 'youtube', login: 'yt', url: 'https://youtube.com/@yt', isManual: true },
      ],
      channelSlug: 'test',
      twitchLogin: null,
    });

    expect(vars.stream_url).toBe('https://youtube.com/@yt');
    expect(vars.twitch_url).toBeUndefined();
    expect(vars.youtube_url).toBe('https://youtube.com/@yt');
  });
});
