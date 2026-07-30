import { describe, expect, it } from 'vitest';
import { calculateCompositionLayout, calculatePreviewCanvasSize } from '@shared/layout';
import { DEFAULT_SETTINGS } from '@shared/presets';

describe('calculateCompositionLayout', () => {
  it('fits a browser frame within the output margin', () => {
    const layout = calculateCompositionLayout(DEFAULT_SETTINGS);
    expect(layout.frame.x).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.margin - 1);
    expect(layout.frame.y).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.margin - 1);
    expect(layout.frame.x + layout.frame.width).toBeLessThanOrEqual(
      DEFAULT_SETTINGS.outputWidth - DEFAULT_SETTINGS.margin + 1,
    );
    expect(layout.browserBarHeight).toBeGreaterThan(0);
    expect(layout.browserAddressHeight).toBeCloseTo(
      layout.browserBarHeight * 0.56,
      5,
    );
    expect(layout.screen.height).toBeLessThan(layout.frame.height);
  });

  it('adds bezels for a phone frame', () => {
    const layout = calculateCompositionLayout({
      ...DEFAULT_SETTINGS,
      outputWidth: 1080,
      outputHeight: 1350,
      viewportWidth: 390,
      viewportHeight: 844,
      frameStyle: 'phone',
      deviceMode: 'mobile',
    });
    expect(layout.phoneBezel.left).toBeGreaterThan(0);
    expect(layout.phoneBezel.top).toBeGreaterThan(0);
    expect(layout.screen.x).toBeGreaterThan(layout.frame.x);
    expect(layout.screen.y).toBeGreaterThan(layout.frame.y);
    expect(layout.browserBarHeight).toBe(0);
    expect(layout.browserAddressHeight).toBe(0);
  });

  it('calculates a bounded preview size', () => {
    const preview = calculatePreviewCanvasSize(1000, 700, 1920, 1080, 40);
    expect(preview.width).toBeLessThanOrEqual(920);
    expect(preview.height).toBeLessThanOrEqual(620);
    expect(preview.width / preview.height).toBeCloseTo(16 / 9, 5);
  });

  it('fits the preview to one axis without default padding', () => {
    const widthLimited = calculatePreviewCanvasSize(1000, 700, 1920, 1080);
    expect(widthLimited.width).toBeCloseTo(1000, 5);
    expect(widthLimited.height).toBeCloseTo(562.5, 5);

    const heightLimited = calculatePreviewCanvasSize(1000, 500, 1920, 1080);
    expect(heightLimited.width).toBeCloseTo(888.888_889, 5);
    expect(heightLimited.height).toBeCloseTo(500, 5);
  });
});
