import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEVICE_PRESETS,
  applyDevicePreset,
} from '@shared/presets';
import {
  MAX_CAPTURE_PIXELS,
  validateCaptureSettings,
  validateTargetViewLayout,
} from '@shared/validation';
import { normalizeMobileOutput } from '@shared/layout';

describe('capture settings validation', () => {
  it('accepts every built-in screenshot and device preset', () => {
    for (const preset of DEVICE_PRESETS) {
      const settings = applyDevicePreset(DEFAULT_SETTINGS, preset);
      expect(validateCaptureSettings(settings)).toEqual(settings);
    }
  });

  it('normalizes mobile output at the validation boundary', () => {
    expect(
      validateCaptureSettings({
        ...DEFAULT_SETTINGS,
        deviceMode: 'mobile',
        frameStyle: 'phone',
        phoneFrameVariant: 'android',
        viewportWidth: 360,
        viewportHeight: 808,
        outputWidth: 1080,
        outputHeight: 1350,
        captureScale: 1,
      }),
    ).toMatchObject({
      outputWidth: 840,
      outputHeight: 1736,
      captureScale: 2,
    });
  });

  it('accepts the tablet frame and rejects unknown frame styles', () => {
    expect(
      validateCaptureSettings({
        ...DEFAULT_SETTINGS,
        frameStyle: 'tablet',
      }).frameStyle,
    ).toBe('tablet');
    expect(() =>
      validateCaptureSettings({
        ...DEFAULT_SETTINGS,
        frameStyle: 'watch',
      }),
    ).toThrow('フレーム種別が不正です');
  });

  it('accepts Android and iPhone frames and rejects unknown variants', () => {
    expect(
      validateCaptureSettings({
        ...DEFAULT_SETTINGS,
        phoneFrameVariant: 'android',
      }).phoneFrameVariant,
    ).toBe('android');
    expect(() =>
      validateCaptureSettings({
        ...DEFAULT_SETTINGS,
        phoneFrameVariant: 'windows-phone',
      }),
    ).toThrow('スマホフレーム種別が不正です');
  });

  it('accepts fluid backgrounds and rejects unknown background styles', () => {
    expect(
      validateCaptureSettings({
        ...DEFAULT_SETTINGS,
        backgroundStyle: 'fluid',
      }).backgroundStyle,
    ).toBe('fluid');
    expect(() =>
      validateCaptureSettings({
        ...DEFAULT_SETTINGS,
        backgroundStyle: 'mesh',
      }),
    ).toThrow('背景スタイルが不正です');
  });

  it('names screenshot and page display fields in validation errors', () => {
    expect(() =>
      validateCaptureSettings({ ...DEFAULT_SETTINGS, outputWidth: 9000 }),
    ).toThrow('スクリーンショットサイズ 幅');
    expect(() =>
      validateCaptureSettings({ ...DEFAULT_SETTINGS, viewportHeight: 5000 }),
    ).toThrow('ページ表示サイズ 高さ');
  });

  it('rejects malformed colors', () => {
    expect(() =>
      validateCaptureSettings({
        ...DEFAULT_SETTINGS,
        gradientFrom: 'lavender',
      }),
    ).toThrow();
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
    ).toThrow('スクリーンショットサイズは合計8,294,400画素以下');
  });

  it('rejects scaled viewport images above the pixel budget', () => {
    expect(() =>
      validateCaptureSettings({
        ...DEFAULT_SETTINGS,
        viewportWidth: 1920,
        viewportHeight: 1081,
        captureScale: 2,
      }),
    ).toThrow(
      '撮影倍率適用後のページ表示サイズは合計8,294,400画素以下',
    );
  });

  it('rejects an oversized automatic mobile output', () => {
    const settings = normalizeMobileOutput({
      ...DEFAULT_SETTINGS,
      deviceMode: 'mobile',
      frameStyle: 'phone',
      viewportWidth: 2048,
      viewportHeight: 2048,
    });

    expect(() => validateCaptureSettings(settings)).toThrow(
      'スクリーンショットサイズは合計8,294,400画素以下',
    );
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
