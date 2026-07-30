import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  GRADIENT_PRESETS,
  VIEWPORT_PRESETS,
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

  it('provides the approved desktop and mobile viewport lists', () => {
    expect(
      viewportPresetsFor('desktop').map(({ width, height }) => [
        width,
        height,
      ]),
    ).toEqual([
      [1920, 1080],
      [1440, 900],
      [1366, 768],
      [1280, 800],
      [1280, 720],
    ]);
    expect(
      viewportPresetsFor('mobile').map(({ width, height }) => [
        width,
        height,
      ]),
    ).toEqual([
      [430, 932],
      [412, 915],
      [390, 844],
      [375, 812],
      [360, 800],
    ]);
  });

  it('changes only the device and viewport fields', () => {
    const preset = VIEWPORT_PRESETS.find(
      (candidate) => candidate.id === 'mobile-android',
    );
    expect(preset).toBeDefined();
    const next = applyViewportPreset(DEFAULT_SETTINGS, preset!);

    expect(next).toEqual({
      ...DEFAULT_SETTINGS,
      deviceMode: 'mobile',
      viewportWidth: 412,
      viewportHeight: 915,
    });
    expect(findViewportPreset(next)?.id).toBe('mobile-android');
    expect(
      findViewportPreset({ ...next, viewportWidth: 411 }),
    ).toBeUndefined();
  });
});
