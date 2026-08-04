import { describe, expect, it } from 'vitest';
import {
  BROWSER_BAR_HEIGHT,
  MOBILE_OUTPUT_SCALE,
  PHONE_BEZEL,
  calculateCompositionLayout,
  calculatePreviewCanvasSize,
  normalizeCaptureGeometry,
  normalizeMobileOutput,
  roundRectangleEdges,
} from '@shared/layout';
import { DEFAULT_SETTINGS } from '@shared/presets';

describe('calculateCompositionLayout', () => {
  it('fits the default Full HD browser and margin into a 1920x1080 screenshot', () => {
    const browser = calculateCompositionLayout(DEFAULT_SETTINGS);

    expect(browser.artboard).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    expect(browser.scale).toBe(1);
    expect(browser.frame).toMatchObject({
      x: 32,
      y: 32,
      width: 1856,
      height: 1016,
    });
    expect(browser.screen).toMatchObject({
      x: 32,
      y: 90,
      width: 1856,
      height: 958,
    });
    expect(browser.frame.radius).toBe(8);
    expect(browser.screen.radius).toBe(6);
  });

  it('uses one clipping radius when no decorative frame exists', () => {
    const layout = calculateCompositionLayout({
      ...DEFAULT_SETTINGS,
      frameStyle: 'none',
    });

    expect(layout.frame.radius).toBe(6);
    expect(layout.screen.radius).toBe(6);
  });

  it.each([
    {
      name: 'browser',
      outputWidth: 1920,
      outputHeight: 1080,
      expectedViewportWidth: 1856,
      expectedViewportHeight: 958,
      frameStyle: 'browser' as const,
      margin: 32,
    },
    {
      name: 'frame-free capture',
      outputWidth: 1200,
      outputHeight: 1200,
      expectedViewportWidth: 1136,
      expectedViewportHeight: 1136,
      frameStyle: 'none' as const,
      margin: 32,
    },
    {
      name: 'phone frame',
      outputWidth: 1080,
      outputHeight: 1350,
      expectedViewportWidth: 938,
      expectedViewportHeight: 1208,
      frameStyle: 'phone' as const,
      margin: 57,
    },
    {
      name: 'tablet frame',
      outputWidth: 1600,
      outputHeight: 900,
      expectedViewportWidth: 1480,
      expectedViewportHeight: 780,
      frameStyle: 'tablet' as const,
      margin: 32,
    },
  ])(
    'derives the desktop viewport inside the $name and exact margin',
    ({
      name: _name,
      expectedViewportWidth,
      expectedViewportHeight,
      ...overrides
    }) => {
      const settings = normalizeCaptureGeometry({
        ...DEFAULT_SETTINGS,
        ...overrides,
        deviceMode: 'desktop',
      });
      const layout = calculateCompositionLayout(settings);

      expect(settings.viewportWidth).toBe(expectedViewportWidth);
      expect(settings.viewportHeight).toBe(expectedViewportHeight);
      expect(layout.scale).toBe(1);
      expect(layout.artboard).toEqual({
        x: 0,
        y: 0,
        width: settings.outputWidth,
        height: settings.outputHeight,
      });
      expect(layout.frame.x).toBe(settings.margin);
      expect(layout.frame.y).toBe(settings.margin);
      expect(
        settings.outputWidth - layout.frame.x - layout.frame.width,
      ).toBe(settings.margin);
      expect(
        settings.outputHeight - layout.frame.y - layout.frame.height,
      ).toBe(settings.margin);
      expect(layout.screen.width).toBe(settings.viewportWidth);
      expect(layout.screen.height).toBe(settings.viewportHeight);
    },
  );

  it.each(['browser', 'phone', 'tablet', 'none'] as const)(
    'keeps the requested margin around a portrait %s frame',
    (frameStyle) => {
      const settings = {
        ...DEFAULT_SETTINGS,
        outputWidth: 1080,
        outputHeight: 1350,
        viewportWidth: 390,
        viewportHeight: 844,
        frameStyle,
        deviceMode: 'mobile' as const,
        margin: 57,
      };
      const layout = calculateCompositionLayout(settings);
      const gaps = {
        left: layout.frame.x - layout.artboard.x,
        top: layout.frame.y - layout.artboard.y,
        right:
          layout.artboard.x +
          layout.artboard.width -
          layout.frame.x -
          layout.frame.width,
        bottom:
          layout.artboard.y +
          layout.artboard.height -
          layout.frame.y -
          layout.frame.height,
      };

      for (const gap of Object.values(gaps)) {
        expect(gap).toBeCloseTo(settings.margin, 0);
      }
    },
  );

  it('recalculates the desktop viewport when its margin changes', () => {
    const original = normalizeCaptureGeometry({
      ...DEFAULT_SETTINGS,
      margin: 32,
    });
    const compact = normalizeCaptureGeometry({ ...original, margin: 16 });

    expect(compact).toMatchObject({
      outputWidth: 1920,
      outputHeight: 1080,
      viewportWidth: 1888,
      viewportHeight: 990,
      margin: 16,
    });
  });

  it('keeps the browser controls inside the fitted frame', () => {
    const layout = calculateCompositionLayout(DEFAULT_SETTINGS);

    expect(layout.browserBarHeight / layout.scale).toBe(BROWSER_BAR_HEIGHT);
    expect(layout.browserAddressHeight).toBeCloseTo(
      layout.browserBarHeight * 0.56,
      5,
    );
    expect(layout.screen.height).toBeLessThan(layout.frame.height);
  });

  it.each([
    ['android', 40, 32],
    ['iphone', 55, 47],
  ] as const)(
    'uses the %s phone radii with one uniform bezel',
    (phoneFrameVariant, frameRadius, screenRadius) => {
      const layout = calculateCompositionLayout({
        ...DEFAULT_SETTINGS,
        outputWidth: 1080,
        outputHeight: 1350,
        viewportWidth: 390,
        viewportHeight: 844,
        frameStyle: 'phone',
        deviceMode: 'mobile',
        phoneFrameVariant,
      });
      expect(layout.phoneBezel.left / layout.scale).toBeCloseTo(
        PHONE_BEZEL,
        5,
      );
      expect(layout.phoneBezel.top / layout.scale).toBeCloseTo(
        PHONE_BEZEL,
        5,
      );
      expect(layout.phoneBezel.right / layout.scale).toBeCloseTo(
        PHONE_BEZEL,
        5,
      );
      expect(layout.phoneBezel.bottom / layout.scale).toBeCloseTo(
        PHONE_BEZEL,
        5,
      );
      expect(layout.screen.x).toBeGreaterThan(layout.frame.x);
      expect(layout.screen.y).toBeGreaterThan(layout.frame.y);
      expect(layout.browserBarHeight).toBe(0);
      expect(layout.browserAddressHeight).toBe(0);
      expect(layout.frame.radius / layout.scale).toBeCloseTo(frameRadius, 5);
      expect(layout.screen.radius / layout.scale).toBeCloseTo(screenRadius, 5);
    },
  );

  it.each(['browser', 'phone', 'tablet', 'none'] as const)(
    'derives a 2x mobile output around the active %s frame and margin',
    (frameStyle) => {
      const normalized = normalizeMobileOutput({
        ...DEFAULT_SETTINGS,
        deviceMode: 'mobile',
        frameStyle,
        viewportWidth: 390,
        viewportHeight: 844,
        margin: 32,
        captureScale: 1,
      });
      const layout = calculateCompositionLayout(normalized);

      expect(normalized.captureScale).toBe(MOBILE_OUTPUT_SCALE);
      expect(layout.scale).toBe(MOBILE_OUTPUT_SCALE);
      expect(layout.artboard).toEqual({
        x: 0,
        y: 0,
        width: normalized.outputWidth,
        height: normalized.outputHeight,
      });
    },
  );

  it('keeps mobile margin values in final PNG pixels', () => {
    const settings = normalizeCaptureGeometry({
      ...DEFAULT_SETTINGS,
      deviceMode: 'mobile',
      frameStyle: 'phone',
      viewportWidth: 402,
      viewportHeight: 874,
      margin: 16,
    });

    expect(settings).toMatchObject({
      outputWidth: 892,
      outputHeight: 1836,
      viewportWidth: 402,
      viewportHeight: 874,
      margin: 16,
      captureScale: 2,
    });
    expect(calculateCompositionLayout(settings).frame.x).toBe(16);
  });

  it('rounds opposing viewport edges without shifting the far edges', () => {
    const bounds = roundRectangleEdges({
      left: 10.4,
      top: 20.4,
      right: 110.6,
      bottom: 220.6,
    });

    expect(bounds).toEqual({ x: 10, y: 20, width: 101, height: 201 });
    expect(bounds.x + bounds.width).toBe(Math.round(110.6));
    expect(bounds.y + bounds.height).toBe(Math.round(220.6));
  });

  it('adds uniform bezels and dedicated radii for a tablet frame', () => {
    const layout = calculateCompositionLayout({
      ...DEFAULT_SETTINGS,
      outputWidth: 1600,
      outputHeight: 1600,
      viewportWidth: 768,
      viewportHeight: 1024,
      frameStyle: 'tablet',
      deviceMode: 'mobile',
    });

    expect(layout.tabletBezel.left / layout.scale).toBeCloseTo(28, 5);
    expect(layout.tabletBezel.top / layout.scale).toBeCloseTo(28, 5);
    expect(layout.tabletBezel.right / layout.scale).toBeCloseTo(28, 5);
    expect(layout.tabletBezel.bottom / layout.scale).toBeCloseTo(28, 5);
    expect(layout.frame.radius / layout.scale).toBeCloseTo(42, 5);
    expect(layout.screen.radius / layout.scale).toBeCloseTo(22, 5);
    expect(layout.screen.x).toBeGreaterThan(layout.frame.x);
    expect(layout.screen.y).toBeGreaterThan(layout.frame.y);
    expect(layout.phoneBezel.left).toBe(0);
    expect(layout.browserBarHeight).toBe(0);
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
