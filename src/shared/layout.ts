import type { CaptureSettings, CompositionLayout } from './types';

const BROWSER_BAR = 58;
const PHONE_LEFT = 24;
const PHONE_RIGHT = 24;
const PHONE_TOP = 54;
const PHONE_BOTTOM = 38;
const PHONE_FRAME_RADIUS = 54;
const PHONE_SCREEN_RADIUS = 38;
const BROWSER_ADDRESS_HEIGHT_RATIO = 0.56;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateCompositionLayout(
  settings: CaptureSettings,
): CompositionLayout {
  const outputWidth = clamp(Math.round(settings.outputWidth), 320, 7680);
  const outputHeight = clamp(Math.round(settings.outputHeight), 320, 7680);
  const viewportWidth = clamp(Math.round(settings.viewportWidth), 240, 3840);
  const viewportHeight = clamp(Math.round(settings.viewportHeight), 240, 3840);
  const maximumMargin = Math.floor(Math.min(outputWidth, outputHeight) * 0.42);
  const margin = clamp(Math.round(settings.margin), 0, maximumMargin);

  let intrinsicWidth = viewportWidth;
  let intrinsicHeight = viewportHeight;
  let screenOffsetX = 0;
  let screenOffsetY = 0;

  if (settings.frameStyle === 'browser') {
    intrinsicHeight += BROWSER_BAR;
    screenOffsetY = BROWSER_BAR;
  } else if (settings.frameStyle === 'phone') {
    intrinsicWidth += PHONE_LEFT + PHONE_RIGHT;
    intrinsicHeight += PHONE_TOP + PHONE_BOTTOM;
    screenOffsetX = PHONE_LEFT;
    screenOffsetY = PHONE_TOP;
  }

  const availableWidth = Math.max(1, outputWidth - margin * 2);
  const availableHeight = Math.max(1, outputHeight - margin * 2);
  const scale = Math.min(
    availableWidth / intrinsicWidth,
    availableHeight / intrinsicHeight,
  );

  const frameWidth = intrinsicWidth * scale;
  const frameHeight = intrinsicHeight * scale;
  const frameX = (outputWidth - frameWidth) / 2;
  const frameY = (outputHeight - frameHeight) / 2;
  const screenWidth = viewportWidth * scale;
  const screenHeight = viewportHeight * scale;

  const frameRadius =
    settings.frameStyle === 'phone'
      ? PHONE_FRAME_RADIUS * scale
      : settings.cornerRadius;
  const screenRadius =
    settings.frameStyle === 'phone'
      ? PHONE_SCREEN_RADIUS * scale
      : settings.frameStyle === 'none'
        ? settings.cornerRadius
        : Math.max(0, settings.cornerRadius - 2);

  return {
    scale,
    frame: {
      x: frameX,
      y: frameY,
      width: frameWidth,
      height: frameHeight,
      radius: frameRadius,
    },
    screen: {
      x: frameX + screenOffsetX * scale,
      y: frameY + screenOffsetY * scale,
      width: screenWidth,
      height: screenHeight,
      radius: screenRadius,
    },
    browserBarHeight: settings.frameStyle === 'browser' ? BROWSER_BAR * scale : 0,
    browserAddressHeight:
      settings.frameStyle === 'browser'
        ? BROWSER_BAR * scale * BROWSER_ADDRESS_HEIGHT_RATIO
        : 0,
    phoneBezel: {
      left: settings.frameStyle === 'phone' ? PHONE_LEFT * scale : 0,
      top: settings.frameStyle === 'phone' ? PHONE_TOP * scale : 0,
      right: settings.frameStyle === 'phone' ? PHONE_RIGHT * scale : 0,
      bottom: settings.frameStyle === 'phone' ? PHONE_BOTTOM * scale : 0,
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
