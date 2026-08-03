import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DESKTOP_RESOLUTION_PRESETS,
  DEVICE_PRESETS,
  GRADIENT_PRESETS,
  MOBILE_DEVICE_PRESETS,
  applyCustomDeviceMode,
  applyDevicePreset,
  devicePresetsFor,
  findDevicePreset,
  migrateV2Settings,
  migrateV3Settings,
} from '@shared/presets';

describe('built-in presets', () => {
  it('starts a new capture as a framed Full HD screenshot', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      outputWidth: 1920,
      outputHeight: 1080,
      viewportWidth: 1856,
      viewportHeight: 958,
      deviceMode: 'desktop',
      frameStyle: 'browser',
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

  it('provides the approved desktop resolutions and their page display sizes', () => {
    expect(
      devicePresetsFor('desktop').map(
        ({ name, outputWidth, outputHeight, viewportWidth, viewportHeight }) => [
          name,
          outputWidth,
          outputHeight,
          viewportWidth,
          viewportHeight,
        ],
      ),
    ).toEqual([
      ['Full HD', 1920, 1080, 1856, 958],
      ['WQHD', 2560, 1440, 2496, 1318],
      ['UWQHD', 3440, 1440, 3376, 1318],
      ['4K UHD', 3840, 2160, 3776, 2038],
    ]);
  });

  it('provides representative Android, iPhone, and iPad page display sizes', () => {
    expect(
      devicePresetsFor('mobile').map(
        ({ group, name, frameStyle, viewportWidth, viewportHeight }) => [
          group,
          name,
          frameStyle,
          viewportWidth,
          viewportHeight,
        ],
      ),
    ).toEqual([
      ['android', 'Google Pixel 10', 'phone', 360, 808],
      ['android', 'Samsung Galaxy S24', 'phone', 360, 780],
      ['iphone', 'iPhone 17', 'phone', 402, 874],
      ['iphone', 'iPhone 17 Pro Max', 'phone', 440, 956],
      ['ipad', 'iPad', 'tablet', 768, 1024],
      ['ipad', 'iPad Pro 12.9″', 'tablet', 1024, 1366],
    ]);
  });

  it('uses a unique identifier for every device preset', () => {
    const ids = DEVICE_PRESETS.map((preset) => preset.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('applies all fields that define a desktop resolution', () => {
    const preset = DESKTOP_RESOLUTION_PRESETS.find(
      (candidate) => candidate.id === 'desktop-wqhd',
    );
    expect(preset).toBeDefined();
    const previous = {
      ...DEFAULT_SETTINGS,
      outputWidth: 1080,
      outputHeight: 1350,
      viewportWidth: 402,
      viewportHeight: 874,
      deviceMode: 'mobile' as const,
      frameStyle: 'phone' as const,
      margin: 80,
      showUrl: false,
    };
    const next = applyDevicePreset(previous, preset!);

    expect(next).toEqual({
      ...previous,
      outputWidth: 2560,
      outputHeight: 1440,
      viewportWidth: 2496,
      viewportHeight: 1318,
      deviceMode: 'desktop',
      frameStyle: 'browser',
      margin: 32,
      captureScale: 1,
      showUrl: true,
    });
  });

  it('keeps a 2x page capture for Full HD', () => {
    const fullHd = DESKTOP_RESOLUTION_PRESETS.find(
      (candidate) => candidate.id === 'desktop-full-hd',
    );
    expect(fullHd).toBeDefined();

    expect(applyDevicePreset(DEFAULT_SETTINGS, fullHd!).captureScale).toBe(2);
    expect(
      applyDevicePreset({ ...DEFAULT_SETTINGS, captureScale: 1 }, fullHd!)
        .captureScale,
    ).toBe(1);
  });

  it.each(['desktop-wqhd', 'desktop-uwqhd', 'desktop-4k-uhd'])(
    'uses a 1x page capture for %s when the previous setting was 2x',
    (presetId) => {
      const preset = DESKTOP_RESOLUTION_PRESETS.find(
        (candidate) => candidate.id === presetId,
      );
      expect(preset).toBeDefined();

      expect(applyDevicePreset(DEFAULT_SETTINGS, preset!).captureScale).toBe(1);
    },
  );

  it('applies a mobile page display size without changing the screenshot', () => {
    const preset = MOBILE_DEVICE_PRESETS.find(
      (candidate) => candidate.id === 'iphone-17-pro-max',
    );
    expect(preset).toBeDefined();
    const previous = {
      ...DEFAULT_SETTINGS,
      outputWidth: 1080,
      outputHeight: 1350,
      margin: 48,
      captureScale: 2 as const,
    };

    expect(applyDevicePreset(previous, preset!)).toEqual({
      ...previous,
      deviceMode: 'mobile',
      frameStyle: 'phone',
      viewportWidth: 440,
      viewportHeight: 956,
      showUrl: false,
    });
  });

  it('uses a tablet frame for iPad page display sizes', () => {
    const preset = MOBILE_DEVICE_PRESETS.find(
      (candidate) => candidate.id === 'tablet-ipad-pro',
    );
    expect(preset).toBeDefined();

    expect(applyDevicePreset(DEFAULT_SETTINGS, preset!)).toMatchObject({
      deviceMode: 'mobile',
      frameStyle: 'tablet',
      viewportWidth: 1024,
      viewportHeight: 1366,
      showUrl: false,
    });
  });

  it('finds a preset only while its defining sizes still match', () => {
    const fullHd = applyDevicePreset(
      DEFAULT_SETTINGS,
      DESKTOP_RESOLUTION_PRESETS[0],
    );
    const pixel = applyDevicePreset(
      DEFAULT_SETTINGS,
      MOBILE_DEVICE_PRESETS[0],
    );

    expect(findDevicePreset(fullHd)?.id).toBe('desktop-full-hd');
    expect(
      findDevicePreset({ ...fullHd, outputWidth: 1919 }),
    ).toBeUndefined();
    expect(
      findDevicePreset({ ...fullHd, frameStyle: 'none' }),
    ).toBeUndefined();
    expect(findDevicePreset({ ...fullHd, margin: 48 })).toBeUndefined();
    expect(findDevicePreset({ ...fullHd, showUrl: false })).toBeUndefined();
    expect(findDevicePreset(pixel)?.id).toBe('android-pixel-10');
    expect(
      findDevicePreset({ ...pixel, frameStyle: 'tablet' }),
    ).toBeUndefined();
    expect(findDevicePreset({ ...pixel, showUrl: true })).toBeUndefined();
  });

  it('restores the category frame when choosing a custom size', () => {
    const phoneSettings = {
      ...DEFAULT_SETTINGS,
      deviceMode: 'mobile' as const,
      frameStyle: 'phone' as const,
      showUrl: false,
    };
    expect(
      applyCustomDeviceMode(
        { ...DEFAULT_SETTINGS, frameStyle: 'none' },
        'mobile',
      ),
    ).toMatchObject({
      deviceMode: 'mobile',
      frameStyle: 'phone',
      showUrl: false,
    });
    expect(
      applyCustomDeviceMode(phoneSettings, 'desktop'),
    ).toMatchObject({
      deviceMode: 'desktop',
      frameStyle: 'browser',
      showUrl: true,
    });
  });
});
