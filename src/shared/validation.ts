import type {
  BackgroundStyle,
  CaptureScale,
  CaptureSettings,
  DeviceMode,
  FrameStyle,
  TargetViewLayout,
} from './types';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const MAX_CAPTURE_PIXELS = 8_294_400;

function finiteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name}が不正です。`);
  }
  return value;
}

function boundedInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const numberValue = Math.round(finiteNumber(value, name));
  if (numberValue < minimum || numberValue > maximum) {
    throw new Error(`${name}は${minimum}〜${maximum}の範囲で指定してください。`);
  }
  return numberValue;
}

function deviceMode(value: unknown): DeviceMode {
  if (value !== 'desktop' && value !== 'mobile') {
    throw new Error('デバイスモードが不正です。');
  }
  return value;
}

function frameStyle(value: unknown): FrameStyle {
  if (
    value !== 'browser' &&
    value !== 'phone' &&
    value !== 'tablet' &&
    value !== 'none'
  ) {
    throw new Error('フレーム種別が不正です。');
  }
  return value;
}

function backgroundStyle(value: unknown): BackgroundStyle {
  if (value !== 'soft' && value !== 'clean') {
    throw new Error('背景スタイルが不正です。');
  }
  return value;
}

function captureScale(value: unknown): CaptureScale {
  if (value !== 1 && value !== 2) {
    throw new Error('撮影倍率が不正です。');
  }
  return value;
}

function hexColor(value: unknown, name: string): string {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    throw new Error(`${name}が不正です。`);
  }
  return value.toLowerCase();
}

export function validateCaptureSettings(value: unknown): CaptureSettings {
  if (!value || typeof value !== 'object') {
    throw new Error('撮影設定がありません。');
  }
  const input = value as Partial<CaptureSettings>;

  const settings: CaptureSettings = {
    outputWidth: boundedInteger(input.outputWidth, '出力幅', 320, 7680),
    outputHeight: boundedInteger(input.outputHeight, '出力高さ', 320, 7680),
    viewportWidth: boundedInteger(input.viewportWidth, '表示幅', 240, 3840),
    viewportHeight: boundedInteger(input.viewportHeight, '表示高さ', 240, 3840),
    deviceMode: deviceMode(input.deviceMode),
    frameStyle: frameStyle(input.frameStyle),
    margin: boundedInteger(input.margin, '余白', 0, 2000),
    cornerRadius: boundedInteger(input.cornerRadius, '角丸', 0, 160),
    shadow: boundedInteger(input.shadow, '影', 0, 100),
    gradientFrom: hexColor(input.gradientFrom, 'グラデーション開始色'),
    gradientTo: hexColor(input.gradientTo, 'グラデーション終了色'),
    gradientAngle: boundedInteger(input.gradientAngle, '角度', 0, 360),
    backgroundStyle: backgroundStyle(input.backgroundStyle),
    captureScale: captureScale(input.captureScale),
    waitMs: boundedInteger(input.waitMs, '撮影待機時間', 0, 10_000),
    hideScrollbars: Boolean(input.hideScrollbars),
    pauseAnimations: Boolean(input.pauseAnimations),
    showUrl: Boolean(input.showUrl),
  };

  const outputPixels = settings.outputWidth * settings.outputHeight;
  if (outputPixels > MAX_CAPTURE_PIXELS) {
    throw new Error(
      `出力画像は合計${MAX_CAPTURE_PIXELS.toLocaleString('ja-JP')}画素以下にしてください。`,
    );
  }

  const physicalViewportWidth =
    settings.viewportWidth * settings.captureScale;
  const physicalViewportHeight =
    settings.viewportHeight * settings.captureScale;
  const pagePixels = physicalViewportWidth * physicalViewportHeight;
  if (pagePixels > MAX_CAPTURE_PIXELS) {
    throw new Error(
      `撮影倍率適用後のページ画像は合計${MAX_CAPTURE_PIXELS.toLocaleString('ja-JP')}画素以下にしてください。`,
    );
  }

  return settings;
}

export function validateTargetViewLayout(value: unknown): TargetViewLayout {
  if (!value || typeof value !== 'object') {
    throw new Error('表示領域が不正です。');
  }
  const input = value as Partial<TargetViewLayout>;
  if (!input.viewport || typeof input.viewport !== 'object') {
    throw new Error('ビューポートが不正です。');
  }

  return {
    x: boundedInteger(input.x, 'X座標', -10_000, 20_000),
    y: boundedInteger(input.y, 'Y座標', -10_000, 20_000),
    width: boundedInteger(input.width, '表示幅', 1, 10_000),
    height: boundedInteger(input.height, '表示高さ', 1, 10_000),
    borderRadius: boundedInteger(input.borderRadius, '角丸', 0, 1000),
    visible: Boolean(input.visible),
    viewport: {
      width: boundedInteger(input.viewport.width, '論理表示幅', 240, 3840),
      height: boundedInteger(input.viewport.height, '論理表示高さ', 240, 3840),
      mode: deviceMode(input.viewport.mode),
    },
  };
}
