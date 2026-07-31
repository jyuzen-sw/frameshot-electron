import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  GRADIENT_PRESETS,
  VIEWPORT_PRESETS,
  applyCustomViewportMode,
  applyViewportPreset,
  findViewportPreset,
  viewportPresetsFor,
} from '@shared/presets';

describe('built-in presets', () => {
  it('uses the darker natural mint gradient by default', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      gradientFrom: '#e3f2e8',
      gradientTo: '#ebf5ed',
      gradientAngle: 135,
      backgroundStyle: 'soft',
    });
  });

  it('uses the adjusted color pair for every gradient preset', () => {
    expect(
      GRADIENT_PRESETS.map(({ id, from, to }) => ({ id, from, to })),
    ).toEqual([
      { id: 'mint-pearl', from: '#e3f2e8', to: '#ebf5ed' },
      { id: 'lavender-mint', from: '#e1e7f9', to: '#ddf7f8' },
      { id: 'blush-cream', from: '#f8e3ee', to: '#f9f3dc' },
      { id: 'sky-lilac', from: '#d2e9f9', to: '#e7d7f9' },
      { id: 'warm-paper', from: '#f9ecdc', to: '#f8f5d8' },
      { id: 'quiet-gray', from: '#e4ebf1', to: '#ebf0f5' },
    ]);
  });

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
