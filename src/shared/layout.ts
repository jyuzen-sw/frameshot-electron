import type { CaptureSettings, CompositionLayout } from './types';

interface RectangleEdges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const BROWSER_BAR_HEIGHT = 58;
export const MOBILE_OUTPUT_SCALE = 2;
export const PHONE_BEZEL = 14;
export const TABLET_BEZEL = 28;
const ANDROID_FRAME_RADIUS = 40;
const ANDROID_SCREEN_RADIUS = 32;
const IPHONE_FRAME_RADIUS = 55;
const IPHONE_SCREEN_RADIUS = 47;
const TABLET_FRAME_RADIUS = 42;
const TABLET_SCREEN_RADIUS = 22;
const BROWSER_ADDRESS_HEIGHT_RATIO = 0.56;

interface FrameMetrics {
  insets: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  frameRadius: number | null;
  screenRadius: number | null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function frameMetrics(
  settings: Pick<CaptureSettings, 'frameStyle' | 'phoneFrameVariant'>,
): FrameMetrics {
  if (settings.frameStyle === 'browser') {
    return {
      insets: { left: 0, top: BROWSER_BAR_HEIGHT, right: 0, bottom: 0 },
      frameRadius: null,
      screenRadius: null,
    };
  }
  if (settings.frameStyle === 'phone') {
    const iphone = settings.phoneFrameVariant === 'iphone';
    return {
      insets: {
        left: PHONE_BEZEL,
        top: PHONE_BEZEL,
        right: PHONE_BEZEL,
        bottom: PHONE_BEZEL,
      },
      frameRadius: iphone ? IPHONE_FRAME_RADIUS : ANDROID_FRAME_RADIUS,
      screenRadius: iphone ? IPHONE_SCREEN_RADIUS : ANDROID_SCREEN_RADIUS,
    };
  }
  if (settings.frameStyle === 'tablet') {
    return {
      insets: {
        left: TABLET_BEZEL,
        top: TABLET_BEZEL,
        right: TABLET_BEZEL,
        bottom: TABLET_BEZEL,
      },
      frameRadius: TABLET_FRAME_RADIUS,
      screenRadius: TABLET_SCREEN_RADIUS,
    };
  }
  return {
    insets: { left: 0, top: 0, right: 0, bottom: 0 },
    frameRadius: null,
    screenRadius: null,
  };
}

export function normalizeMobileOutput(
  settings: CaptureSettings,
): CaptureSettings {
  return settings.deviceMode === 'mobile'
    ? normalizeCaptureGeometry(settings)
    : settings;
}

export function normalizeCaptureGeometry(
  settings: CaptureSettings,
): CaptureSettings {
  const { insets } = frameMetrics(settings);
  const margin = Math.round(settings.margin);
  if (settings.deviceMode === 'desktop') {
    const outputWidth = Math.round(settings.outputWidth);
    const outputHeight = Math.round(settings.outputHeight);
    return {
      ...settings,
      outputWidth,
      outputHeight,
      viewportWidth:
        outputWidth - insets.left - insets.right - margin * 2,
      viewportHeight:
        outputHeight - insets.top - insets.bottom - margin * 2,
      margin,
    };
  }

  const viewportWidth = Math.round(settings.viewportWidth);
  const viewportHeight = Math.round(settings.viewportHeight);
  return {
    ...settings,
    outputWidth:
      (viewportWidth + insets.left + insets.right) * MOBILE_OUTPUT_SCALE +
      margin * 2,
    outputHeight:
      (viewportHeight + insets.top + insets.bottom) * MOBILE_OUTPUT_SCALE +
      margin * 2,
    viewportWidth,
    viewportHeight,
    margin,
    captureScale: MOBILE_OUTPUT_SCALE,
  };
}

export function roundRectangleEdges(rectangle: RectangleEdges): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const left = Math.round(rectangle.left);
  const top = Math.round(rectangle.top);
  const right = Math.round(rectangle.right);
  const bottom = Math.round(rectangle.bottom);
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function calculateCompositionLayout(
  settings: CaptureSettings,
): CompositionLayout {
  const normalized = normalizeCaptureGeometry(settings);
  const outputWidth = normalized.outputWidth;
  const outputHeight = normalized.outputHeight;
  const viewportWidth = normalized.viewportWidth;
  const viewportHeight = normalized.viewportHeight;
  const margin = normalized.margin;
  const metrics = frameMetrics(normalized);
  const { insets } = metrics;
  const intrinsicWidth = viewportWidth + insets.left + insets.right;
  const intrinsicHeight = viewportHeight + insets.top + insets.bottom;
  const scale =
    normalized.deviceMode === 'mobile' ? MOBILE_OUTPUT_SCALE : 1;

  const frameWidth = intrinsicWidth * scale;
  const frameHeight = intrinsicHeight * scale;
  const frameX = margin;
  const frameY = margin;
  const screenWidth = viewportWidth * scale;
  const screenHeight = viewportHeight * scale;
  const artboard = {
    x: 0,
    y: 0,
    width: outputWidth,
    height: outputHeight,
  };

  const desktopScreenRadius = Math.max(0, normalized.cornerRadius - 2);
  const frameRadius =
    metrics.frameRadius !== null
      ? metrics.frameRadius * scale
      : normalized.frameStyle === 'none'
        ? desktopScreenRadius
        : normalized.cornerRadius;
  const screenRadius =
    metrics.screenRadius !== null
      ? metrics.screenRadius * scale
      : desktopScreenRadius;

  return {
    scale,
    artboard,
    frame: {
      x: frameX,
      y: frameY,
      width: frameWidth,
      height: frameHeight,
      radius: frameRadius,
    },
    screen: {
      x: frameX + insets.left * scale,
      y: frameY + insets.top * scale,
      width: screenWidth,
      height: screenHeight,
      radius: screenRadius,
    },
    browserBarHeight:
      normalized.frameStyle === 'browser' ? BROWSER_BAR_HEIGHT * scale : 0,
    browserAddressHeight:
      normalized.frameStyle === 'browser'
        ? BROWSER_BAR_HEIGHT * scale * BROWSER_ADDRESS_HEIGHT_RATIO
        : 0,
    phoneBezel: {
      left: normalized.frameStyle === 'phone' ? insets.left * scale : 0,
      top: normalized.frameStyle === 'phone' ? insets.top * scale : 0,
      right: normalized.frameStyle === 'phone' ? insets.right * scale : 0,
      bottom: normalized.frameStyle === 'phone' ? insets.bottom * scale : 0,
    },
    tabletBezel: {
      left: normalized.frameStyle === 'tablet' ? TABLET_BEZEL * scale : 0,
      top: normalized.frameStyle === 'tablet' ? TABLET_BEZEL * scale : 0,
      right: normalized.frameStyle === 'tablet' ? TABLET_BEZEL * scale : 0,
      bottom: normalized.frameStyle === 'tablet' ? TABLET_BEZEL * scale : 0,
    },
  };
}

export function calculatePreviewCanvasSize(
  containerWidth: number,
  containerHeight: number,
  outputWidth: number,
  outputHeight: number,
  padding = 0,
): { width: number; height: number; scale: number } {
  const safeWidth = Math.max(1, containerWidth - padding * 2);
  const safeHeight = Math.max(1, containerHeight - padding * 2);
  const scale = Math.min(safeWidth / outputWidth, safeHeight / outputHeight);
  return {
    width: outputWidth * scale,
    height: outputHeight * scale,
    scale,
  };
}

export function shadowCss(intensity: number): string {
  const normalized = clamp(intensity, 0, 100) / 100;
  const alpha1 = (0.07 + normalized * 0.17).toFixed(3);
  const alpha2 = (0.04 + normalized * 0.09).toFixed(3);
  const blur1 = Math.round(28 + normalized * 62);
  const y1 = Math.round(14 + normalized * 28);
  const blur2 = Math.round(10 + normalized * 22);
  const y2 = Math.round(4 + normalized * 10);
  return `0 ${y1}px ${blur1}px rgba(15,23,42,${alpha1}), 0 ${y2}px ${blur2}px rgba(15,23,42,${alpha2})`;
}
