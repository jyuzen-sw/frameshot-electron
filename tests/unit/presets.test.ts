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
  inferPhoneFrameVariant,
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
      phoneFrameVariant: 'iphone',
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

  it('provides the approved desktop resolution groups', () => {
    expect(
      devicePresetsFor('desktop').map(
        ({ group, name, outputWidth, outputHeight }) => [
          group,
          name,
          outputWidth,
          outputHeight,
        ],
      ),
    ).toEqual([
      ['full-hd-and-below', 'Full HD', 1920, 1080],
      ['full-hd-and-below', 'Desktop', 1440, 900],
      ['full-hd-and-below', 'Laptop', 1366, 768],
      ['full-hd-and-below', 'Compact', 1280, 800],
      ['full-hd-and-below', 'HD', 1280, 720],
      ['high-resolution', 'WQHD', 2560, 1440],
      ['high-resolution', 'UWQHD', 3440, 1440],
      ['high-resolution', '4K UHD', 3840, 2160],
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

  it('applies a desktop resolution while preserving its independent margin', () => {
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
      viewportWidth: 2400,
      viewportHeight: 1222,
      deviceMode: 'desktop',
      frameStyle: 'browser',
      margin: 80,
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

  it.each([
    'desktop-default',
    'desktop-laptop',
    'desktop-compact',
    'desktop-hd',
  ])('keeps a 2x page capture for %s', (presetId) => {
    const preset = DESKTOP_RESOLUTION_PRESETS.find(
      (candidate) => candidate.id === presetId,
    );
    expect(preset).toBeDefined();

    expect(applyDevicePreset(DEFAULT_SETTINGS, preset!).captureScale).toBe(2);
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

  it.each([
    ['android-pixel-10', 'android', 840, 1736],
    ['android-galaxy-s24', 'android', 840, 1680],
    ['iphone-17', 'iphone', 924, 1868],
    ['iphone-17-pro-max', 'iphone', 1000, 2032],
    ['tablet-ipad', 'iphone', 1712, 2224],
    ['tablet-ipad-pro', 'iphone', 2224, 2908],
  ] as const)(
    'applies %s with its exact automatic output',
    (presetId, phoneFrameVariant, outputWidth, outputHeight) => {
      const preset = MOBILE_DEVICE_PRESETS.find(
        (candidate) => candidate.id === presetId,
      );
      expect(preset).toBeDefined();

      expect(applyDevicePreset(DEFAULT_SETTINGS, preset!)).toMatchObject({
        deviceMode: 'mobile',
        frameStyle: preset!.frameStyle,
        phoneFrameVariant,
        outputWidth,
        outputHeight,
        captureScale: 2,
        showUrl: false,
      });
    },
  );

  it('uses a tablet frame for iPad page display sizes', () => {
    const preset = MOBILE_DEVICE_PRESETS.find(
      (candidate) => candidate.id === 'tablet-ipad-pro',
    );
    expect(preset).toBeDefined();

    expect(
      applyDevicePreset(
        { ...DEFAULT_SETTINGS, phoneFrameVariant: 'android' },
        preset!,
      ),
    ).toMatchObject({
      deviceMode: 'mobile',
      frameStyle: 'tablet',
      phoneFrameVariant: 'android',
      viewportWidth: 1024,
      viewportHeight: 1366,
      showUrl: false,
    });
  });

  it('matches desktop presets by size independently from frame and margin', () => {
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
    ).toMatchObject({ id: 'desktop-full-hd' });
    expect(findDevicePreset({ ...fullHd, margin: 48 })).toMatchObject({
      id: 'desktop-full-hd',
    });
    expect(findDevicePreset({ ...fullHd, showUrl: false })).toMatchObject({
      id: 'desktop-full-hd',
    });
    expect(
      findDevicePreset({ ...fullHd, viewportWidth: 1200 }),
    ).toMatchObject({ id: 'desktop-full-hd' });
    expect(findDevicePreset(pixel)?.id).toBe('android-pixel-10');
    expect(
      findDevicePreset({ ...pixel, phoneFrameVariant: 'iphone' }),
    ).toBeUndefined();
    expect(
      findDevicePreset({ ...pixel, frameStyle: 'tablet' }),
    ).toBeUndefined();
    expect(findDevicePreset({ ...pixel, showUrl: true })).toBeUndefined();
  });

  it('seeds a phone page when entering mobile custom size from desktop', () => {
    const phoneSettings = {
      ...DEFAULT_SETTINGS,
      deviceMode: 'mobile' as const,
      frameStyle: 'phone' as const,
      showUrl: false,
    };
    expect(
      applyCustomDeviceMode(
        {
          ...DEFAULT_SETTINGS,
          frameStyle: 'none',
          phoneFrameVariant: 'android',
        },
        'mobile',
      ),
    ).toMatchObject({
      deviceMode: 'mobile',
      frameStyle: 'phone',
      phoneFrameVariant: 'android',
      viewportWidth: 390,
      viewportHeight: 844,
      outputWidth: 900,
      outputHeight: 1808,
      captureScale: 2,
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

  it('keeps a custom mobile page and the last phone frame variant', () => {
    const custom = applyCustomDeviceMode(
      {
        ...DEFAULT_SETTINGS,
        deviceMode: 'mobile',
        frameStyle: 'tablet',
        phoneFrameVariant: 'android',
        viewportWidth: 412,
        viewportHeight: 915,
      },
      'mobile',
    );

    expect(custom).toMatchObject({
      frameStyle: 'phone',
      phoneFrameVariant: 'android',
      viewportWidth: 412,
      viewportHeight: 915,
      outputWidth: 944,
      outputHeight: 1950,
    });
  });

  it.each([
    [
      { deviceMode: 'mobile', viewportWidth: 360, viewportHeight: 808 },
      'android',
    ],
    [
      { deviceMode: 'mobile', viewportWidth: 402, viewportHeight: 874 },
      'iphone',
    ],
    [
      { deviceMode: 'mobile', viewportWidth: 390, viewportHeight: 844 },
      'iphone',
    ],
  ] as const)(
    'infers a legacy phone frame variant from %o',
    (legacy, expected) => {
      expect(inferPhoneFrameVariant(legacy)).toBe(expected);
    },
  );
});
