import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  VIEWPORT_PRESETS,
  applyViewportPreset,
} from '@shared/presets';
import {
  MAX_CAPTURE_PIXELS,
  validateCaptureSettings,
  validateTargetViewLayout,
} from '@shared/validation';

describe('capture settings validation', () => {
  it('accepts every built-in viewport preset', () => {
    for (const preset of VIEWPORT_PRESETS) {
      const settings = applyViewportPreset(DEFAULT_SETTINGS, preset);
      expect(validateCaptureSettings(settings)).toEqual(settings);
    }
  });

  it('rejects oversized output and malformed colors', () => {
    expect(() => validateCaptureSettings({ ...DEFAULT_SETTINGS, outputWidth: 9000 })).toThrow();
    expect(() => validateCaptureSettings({ ...DEFAULT_SETTINGS, gradientFrom: 'lavender' })).toThrow();
  });

  it('accepts output and scaled viewport images up to the 4K pixel budget', () => {
    const settings = validateCaptureSettings({
      ...DEFAULT_SETTINGS,
      outputWidth: 3840,
      outputHeight: 2160,
      viewportWidth: 2160,
      viewportHeight: 3840,
      captureScale: 1,
    });

    expect(settings.outputWidth * settings.outputHeight).toBe(
      MAX_CAPTURE_PIXELS,
    );
    expect(
      settings.viewportWidth *
        settings.captureScale *
        settings.viewportHeight *
        settings.captureScale,
    ).toBe(MAX_CAPTURE_PIXELS);
  });

  it('rejects output images above the pixel budget', () => {
    expect(() =>
      validateCaptureSettings({
        ...DEFAULT_SETTINGS,
        outputWidth: 3840,
        outputHeight: 2161,
        captureScale: 1,
      }),
    ).toThrow('出力画像は合計8,294,400画素以下');
  });

  it('rejects scaled viewport images above the pixel budget', () => {
    expect(() =>
      validateCaptureSettings({
        ...DEFAULT_SETTINGS,
        viewportWidth: 1920,
        viewportHeight: 1081,
        captureScale: 2,
      }),
    ).toThrow('撮影倍率適用後のページ画像は合計8,294,400画素以下');
  });
});

describe('target layout validation', () => {
  it('accepts a hidden layout', () => {
    expect(
      validateTargetViewLayout({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        borderRadius: 0,
        visible: false,
        viewport: { width: 390, height: 844, mode: 'mobile' },
      }),
    ).toMatchObject({ visible: false });
  });
});
