import { describe, expect, it } from 'vitest';
import {
  BROWSER_BAR_HEIGHT,
  MOBILE_OUTPUT_SCALE,
  PHONE_BEZEL,
  calculateCompositionLayout,
  calculatePreviewCanvasSize,
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
      name: 'landscape browser in a 16:9 output',
      outputWidth: 1920,
      outputHeight: 1080,
      viewportWidth: 1440,
      viewportHeight: 900,
      frameStyle: 'browser' as const,
      deviceMode: 'desktop' as const,
    },
    {
      name: 'wide page in a square output',
      outputWidth: 1200,
      outputHeight: 1200,
      viewportWidth: 1600,
      viewportHeight: 900,
      frameStyle: 'none' as const,
      deviceMode: 'desktop' as const,
    },
    {
      name: 'phone page in a portrait output',
      outputWidth: 1080,
      outputHeight: 1350,
      viewportWidth: 390,
      viewportHeight: 844,
      frameStyle: 'phone' as const,
      deviceMode: 'mobile' as const,
    },
    {
      name: 'tablet page in a landscape output',
      outputWidth: 1600,
      outputHeight: 900,
      viewportWidth: 768,
      viewportHeight: 1024,
      frameStyle: 'tablet' as const,
      deviceMode: 'mobile' as const,
    },
  ])(
    'centers the $name while preserving its ratio and minimum margin',
    ({ name: _name, ...overrides }) => {
      const settings = { ...DEFAULT_SETTINGS, ...overrides };
      const layout = calculateCompositionLayout(settings);
      const edges = {
        left: layout.frame.x,
        top: layout.frame.y,
        right:
          settings.outputWidth - layout.frame.x - layout.frame.width,
        bottom:
          settings.outputHeight - layout.frame.y - layout.frame.height,
      };

      expect(edges.left).toBeCloseTo(edges.right, 8);
      expect(edges.top).toBeCloseTo(edges.bottom, 8);
      expect(layout.screen.width / layout.screen.height).toBeCloseTo(
        settings.viewportWidth / settings.viewportHeight,
        8,
      );
      expect(layout.screen.width / settings.viewportWidth).toBeCloseTo(
        layout.screen.height / settings.viewportHeight,
        8,
      );
      for (const edge of Object.values(edges)) {
        expect(edge).toBeGreaterThanOrEqual(settings.margin - 1e-8);
      }
      expect(Math.min(...Object.values(edges))).toBeCloseTo(
        settings.margin,
        8,
      );

      const expectedArtboard = roundRectangleEdges({
        left: Math.max(0, layout.frame.x - settings.margin),
        top: Math.max(0, layout.frame.y - settings.margin),
        right: Math.min(
          settings.outputWidth,
          layout.frame.x + layout.frame.width + settings.margin,
        ),
        bottom: Math.min(
          settings.outputHeight,
          layout.frame.y + layout.frame.height + settings.margin,
        ),
      });
      expect(layout.artboard).toEqual(expectedArtboard);
      expect(Number.isInteger(layout.artboard.x)).toBe(true);
      expect(Number.isInteger(layout.artboard.y)).toBe(true);
      expect(Number.isInteger(layout.artboard.width)).toBe(true);
      expect(Number.isInteger(layout.artboard.height)).toBe(true);
      expect(layout.artboard.x).toBeGreaterThanOrEqual(0);
      expect(layout.artboard.y).toBeGreaterThanOrEqual(0);
      expect(layout.artboard.x + layout.artboard.width).toBeLessThanOrEqual(
        settings.outputWidth,
      );
      expect(layout.artboard.y + layout.artboard.height).toBeLessThanOrEqual(
        settings.outputHeight,
      );
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

  it('clamps an oversized requested margin into the maximum canvas', () => {
    const layout = calculateCompositionLayout({
      ...DEFAULT_SETTINGS,
      outputWidth: 320,
      outputHeight: 320,
      viewportWidth: 3840,
      viewportHeight: 240,
      frameStyle: 'none',
      margin: 2_000,
    });

    expect(layout.artboard.x).toBeGreaterThanOrEqual(0);
    expect(layout.artboard.y).toBeGreaterThanOrEqual(0);
    expect(layout.artboard.x + layout.artboard.width).toBeLessThanOrEqual(320);
    expect(layout.artboard.y + layout.artboard.height).toBeLessThanOrEqual(320);
    expect(layout.artboard.width).toBe(320);
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
