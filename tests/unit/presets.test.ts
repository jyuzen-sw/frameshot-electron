import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  GRADIENT_PRESETS,
  VIEWPORT_PRESETS,
  applyCustomViewportMode,
  applyViewportPreset,
  findViewportPreset,
  migrateV2Settings,
  migrateV3Settings,
  viewportPresetsFor,
} from '@shared/presets';

describe('built-in presets', () => {
  it('uses a 32px frame margin and natural mint background by default', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      margin: 32,
      cornerRadius: 8,
      gradientFrom: '#e3f2e8',
      gradientTo: '#ebf5ed',
      gradientAngle: 135,
      backgroundStyle: 'soft',
    });
  });

  it('provides six soft backgrounds and four fluid backgrounds', () => {
    expect(GRADIENT_PRESETS).toEqual([
      {
        id: 'mint-pearl',
        name: 'Mint Pearl',
        from: '#e3f2e8',
        to: '#ebf5ed',
        angle: 135,
        backgroundStyle: 'soft',
      },
      {
        id: 'lavender-mint',
        name: 'Lavender Mint',
        from: '#e1e7f9',
        to: '#ddf7f8',
        angle: 135,
        backgroundStyle: 'soft',
      },
      {
        id: 'blush-cream',
        name: 'Blush Cream',
        from: '#f8e3ee',
        to: '#f9f3dc',
        angle: 145,
        backgroundStyle: 'soft',
      },
      {
        id: 'sky-lilac',
        name: 'Sky Lilac',
        from: '#d2e9f9',
        to: '#e7d7f9',
        angle: 125,
        backgroundStyle: 'soft',
      },
      {
        id: 'warm-paper',
        name: 'Warm Paper',
        from: '#f9ecdc',
        to: '#f8f5d8',
        angle: 150,
        backgroundStyle: 'soft',
      },
      {
        id: 'quiet-gray',
        name: 'Quiet Gray',
        from: '#e4ebf1',
        to: '#ebf0f5',
        angle: 135,
        backgroundStyle: 'soft',
      },
      {
        id: 'sea-glass-flow',
        name: 'Sea Glass Flow',
        from: '#d9f2ec',
        to: '#dce7fb',
        angle: 128,
        backgroundStyle: 'fluid',
      },
      {
        id: 'orchid-tide',
        name: 'Orchid Tide',
        from: '#eadcf7',
        to: '#d9edf5',
        angle: 118,
        backgroundStyle: 'fluid',
      },
      {
        id: 'rosewater-ink',
        name: 'Rosewater Ink',
        from: '#f6dde8',
        to: '#f5e8d7',
        angle: 148,
        backgroundStyle: 'fluid',
      },
      {
        id: 'apricot-lilac',
        name: 'Apricot Lilac',
        from: '#f7e0cf',
        to: '#e6ddf6',
        angle: 155,
        backgroundStyle: 'fluid',
      },
    ]);
  });

  it('uses a unique identifier for every background preset', () => {
    const ids = GRADIENT_PRESETS.map((preset) => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([
    { margin: 32, cornerRadius: 28, nextRadius: 8 },
    { margin: 32, cornerRadius: 12, nextRadius: 12 },
    { margin: 12, cornerRadius: 28, nextRadius: 8 },
    { margin: 31, cornerRadius: 27, nextRadius: 27 },
  ])(
    'migrates only the v2 radius default from margin $margin and radius $cornerRadius',
    ({ margin, cornerRadius, nextRadius }) => {
      const previous = {
        ...DEFAULT_SETTINGS,
        margin,
        cornerRadius,
        gradientAngle: 212,
      };

      expect(migrateV2Settings(previous)).toEqual({
        ...previous,
        cornerRadius: nextRadius,
      });
    },
  );

  it.each([
    { margin: 8, nextMargin: 32 },
    { margin: 0, nextMargin: 0 },
    { margin: 19, nextMargin: 19 },
    { margin: 32, nextMargin: 32 },
  ])(
    'migrates the v3 margin $margin to $nextMargin',
    ({ margin, nextMargin }) => {
      const previous = {
        ...DEFAULT_SETTINGS,
        margin,
        gradientAngle: 212,
      };

      expect(migrateV3Settings(previous)).toEqual({
        ...previous,
        margin: nextMargin,
      });
    },
  );

  it('provides the approved desktop, phone, and iPad viewport lists', () => {
    expect(
      viewportPresetsFor('desktop').map(({ frameStyle, width, height }) => [
        frameStyle,
        width,
        height,
      ]),
    ).toEqual([
      ['browser', 1920, 1080],
      ['browser', 1440, 900],
      ['browser', 1366, 768],
      ['browser', 1280, 800],
      ['browser', 1280, 720],
    ]);
    expect(
      viewportPresetsFor('mobile').map(({ frameStyle, width, height }) => [
        frameStyle,
        width,
        height,
      ]),
    ).toEqual([
      ['phone', 430, 932],
      ['phone', 412, 915],
      ['phone', 390, 844],
      ['phone', 375, 812],
      ['phone', 360, 800],
      ['tablet', 768, 1024],
      ['tablet', 1024, 1366],
    ]);
  });

  it('applies the device, viewport, and recommended frame fields', () => {
    const preset = VIEWPORT_PRESETS.find(
      (candidate) => candidate.id === 'mobile-android',
    );
    expect(preset).toBeDefined();
    const next = applyViewportPreset(DEFAULT_SETTINGS, preset!);

    expect(next).toEqual({
      ...DEFAULT_SETTINGS,
      deviceMode: 'mobile',
      frameStyle: 'phone',
      viewportWidth: 412,
      viewportHeight: 915,
      showUrl: false,
    });
    expect(findViewportPreset(next)?.id).toBe('mobile-android');
    expect(
      findViewportPreset({ ...next, viewportWidth: 411 }),
    ).toBeUndefined();
  });

  it('applies a dedicated tablet frame to iPad presets', () => {
    const preset = VIEWPORT_PRESETS.find(
      (candidate) => candidate.id === 'tablet-ipad-pro',
    );
    expect(preset).toBeDefined();

    expect(applyViewportPreset(DEFAULT_SETTINGS, preset!)).toMatchObject({
      deviceMode: 'mobile',
      frameStyle: 'tablet',
      viewportWidth: 1024,
      viewportHeight: 1366,
      showUrl: false,
    });
  });

  it('restores the category frame when selecting a preset or custom size', () => {
    const phoneSettings = {
      ...DEFAULT_SETTINGS,
      deviceMode: 'mobile' as const,
      frameStyle: 'phone' as const,
      showUrl: false,
    };
    const desktopPreset = VIEWPORT_PRESETS.find(
      (candidate) => candidate.id === 'desktop-default',
    );
    expect(desktopPreset).toBeDefined();

    expect(
      applyViewportPreset(phoneSettings, desktopPreset!),
    ).toMatchObject({
      deviceMode: 'desktop',
      frameStyle: 'browser',
      showUrl: true,
    });
    expect(
      applyCustomViewportMode(
        { ...DEFAULT_SETTINGS, frameStyle: 'none' },
        'mobile',
      ),
    ).toMatchObject({
      deviceMode: 'mobile',
      frameStyle: 'phone',
      showUrl: false,
    });
    expect(
      applyCustomViewportMode(phoneSettings, 'desktop'),
    ).toMatchObject({
      deviceMode: 'desktop',
      frameStyle: 'browser',
      showUrl: true,
    });
  });
});
