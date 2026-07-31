import type {
  CaptureSettings,
  DeviceMode,
  GradientPreset,
  ViewportPreset,
} from './types';

export const DEFAULT_SETTINGS: CaptureSettings = {
  outputWidth: 1920,
  outputHeight: 1080,
  viewportWidth: 1440,
  viewportHeight: 900,
  deviceMode: 'desktop',
  frameStyle: 'browser',
  margin: 32,
  cornerRadius: 28,
  shadow: 62,
  gradientFrom: '#e3f2e8',
  gradientTo: '#ebf5ed',
  gradientAngle: 135,
  backgroundStyle: 'soft',
  captureScale: 2,
  waitMs: 500,
  hideScrollbars: true,
  pauseAnimations: false,
  showUrl: true,
};

export const VIEWPORT_PRESETS: readonly ViewportPreset[] = [
  {
    id: 'desktop-full-hd',
    name: 'Full HD',
    deviceMode: 'desktop',
    frameStyle: 'browser',
    width: 1920,
    height: 1080,
  },
  {
    id: 'desktop-default',
    name: 'Desktop',
    deviceMode: 'desktop',
    frameStyle: 'browser',
    width: 1440,
    height: 900,
  },
  {
    id: 'desktop-laptop',
    name: 'Laptop',
    deviceMode: 'desktop',
    frameStyle: 'browser',
    width: 1366,
    height: 768,
  },
  {
    id: 'desktop-compact',
    name: 'Compact',
    deviceMode: 'desktop',
    frameStyle: 'browser',
    width: 1280,
    height: 800,
  },
  {
    id: 'desktop-hd',
    name: 'HD',
    deviceMode: 'desktop',
    frameStyle: 'browser',
    width: 1280,
    height: 720,
  },
  {
    id: 'mobile-large',
    name: 'Large',
    deviceMode: 'mobile',
    frameStyle: 'phone',
    width: 430,
    height: 932,
  },
  {
    id: 'mobile-android',
    name: 'Android',
    deviceMode: 'mobile',
    frameStyle: 'phone',
    width: 412,
    height: 915,
  },
  {
    id: 'mobile-default',
    name: 'Phone',
    deviceMode: 'mobile',
    frameStyle: 'phone',
    width: 390,
    height: 844,
  },
  {
    id: 'mobile-compact',
    name: 'Compact',
    deviceMode: 'mobile',
    frameStyle: 'phone',
    width: 375,
    height: 812,
  },
  {
    id: 'mobile-small',
    name: 'Small',
    deviceMode: 'mobile',
    frameStyle: 'phone',
    width: 360,
    height: 800,
  },
  {
    id: 'tablet-ipad',
    name: 'iPad',
    deviceMode: 'mobile',
    frameStyle: 'tablet',
    width: 768,
    height: 1024,
  },
  {
    id: 'tablet-ipad-pro',
    name: 'iPad Pro 12.9″',
    deviceMode: 'mobile',
    frameStyle: 'tablet',
    width: 1024,
    height: 1366,
  },
];

export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: 'mint-pearl',
    name: 'Mint Pearl',
    from: '#e3f2e8',
    to: '#ebf5ed',
    angle: 135,
  },
  {
    id: 'lavender-mint',
    name: 'Lavender Mint',
    from: '#e1e7f9',
    to: '#ddf7f8',
    angle: 135,
  },
  {
    id: 'blush-cream',
    name: 'Blush Cream',
    from: '#f8e3ee',
    to: '#f9f3dc',
    angle: 145,
  },
  {
    id: 'sky-lilac',
    name: 'Sky Lilac',
    from: '#d2e9f9',
    to: '#e7d7f9',
    angle: 125,
  },
  {
    id: 'warm-paper',
    name: 'Warm Paper',
    from: '#f9ecdc',
    to: '#f8f5d8',
    angle: 150,
  },
  {
    id: 'quiet-gray',
    name: 'Quiet Gray',
    from: '#e4ebf1',
    to: '#ebf0f5',
    angle: 135,
  },
];

export function cloneSettings(settings: CaptureSettings): CaptureSettings {
  return { ...settings };
}

export function viewportPresetsFor(
  deviceMode: DeviceMode,
): readonly ViewportPreset[] {
  return VIEWPORT_PRESETS.filter((preset) => preset.deviceMode === deviceMode);
}

export function findViewportPreset(
  settings: Pick<
    CaptureSettings,
    'deviceMode' | 'viewportWidth' | 'viewportHeight'
  >,
): ViewportPreset | undefined {
  return VIEWPORT_PRESETS.find(
    (preset) =>
      preset.deviceMode === settings.deviceMode &&
      preset.width === settings.viewportWidth &&
      preset.height === settings.viewportHeight,
  );
}

export function applyViewportPreset(
  settings: CaptureSettings,
  preset: ViewportPreset,
): CaptureSettings {
  return {
    ...settings,
    deviceMode: preset.deviceMode,
    frameStyle: preset.frameStyle,
    viewportWidth: preset.width,
    viewportHeight: preset.height,
    showUrl: preset.frameStyle === 'browser',
  };
}

export function applyCustomViewportMode(
  settings: CaptureSettings,
  deviceMode: DeviceMode,
): CaptureSettings {
  const frameStyle = deviceMode === 'desktop' ? 'browser' : 'phone';
  return {
    ...settings,
    deviceMode,
    frameStyle,
    showUrl: frameStyle === 'browser',
  };
}
