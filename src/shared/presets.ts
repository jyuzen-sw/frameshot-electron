import type {
  CaptureSettings,
  DesktopResolutionPreset,
  DevicePreset,
  DeviceMode,
  GradientPreset,
  MobileDevicePreset,
} from './types';
import { BROWSER_BAR_HEIGHT } from './layout';
import { MAX_CAPTURE_PIXELS } from './validation';

export const DESKTOP_PRESET_MARGIN = 32;

function desktopResolutionPreset(
  id: string,
  name: string,
  outputWidth: number,
  outputHeight: number,
): DesktopResolutionPreset {
  return {
    kind: 'desktop',
    id,
    name,
    deviceMode: 'desktop',
    frameStyle: 'browser',
    outputWidth,
    outputHeight,
    viewportWidth: outputWidth - DESKTOP_PRESET_MARGIN * 2,
    viewportHeight:
      outputHeight - DESKTOP_PRESET_MARGIN * 2 - BROWSER_BAR_HEIGHT,
    margin: DESKTOP_PRESET_MARGIN,
  };
}

const FULL_HD_PRESET = desktopResolutionPreset(
  'desktop-full-hd',
  'Full HD',
  1920,
  1080,
);

export const DESKTOP_RESOLUTION_PRESETS: readonly DesktopResolutionPreset[] = [
  FULL_HD_PRESET,
  desktopResolutionPreset('desktop-wqhd', 'WQHD', 2560, 1440),
  desktopResolutionPreset('desktop-uwqhd', 'UWQHD', 3440, 1440),
  desktopResolutionPreset('desktop-4k-uhd', '4K UHD', 3840, 2160),
];

export const MOBILE_DEVICE_PRESETS: readonly MobileDevicePreset[] = [
  {
    kind: 'mobile',
    id: 'android-pixel-10',
    name: 'Google Pixel 10',
    group: 'android',
    deviceMode: 'mobile',
    frameStyle: 'phone',
    viewportWidth: 360,
    viewportHeight: 808,
  },
  {
    kind: 'mobile',
    id: 'android-galaxy-s24',
    name: 'Samsung Galaxy S24',
    group: 'android',
    deviceMode: 'mobile',
    frameStyle: 'phone',
    viewportWidth: 360,
    viewportHeight: 780,
  },
  {
    kind: 'mobile',
    id: 'iphone-17',
    name: 'iPhone 17',
    group: 'iphone',
    deviceMode: 'mobile',
    frameStyle: 'phone',
    viewportWidth: 402,
    viewportHeight: 874,
  },
  {
    kind: 'mobile',
    id: 'iphone-17-pro-max',
    name: 'iPhone 17 Pro Max',
    group: 'iphone',
    deviceMode: 'mobile',
    frameStyle: 'phone',
    viewportWidth: 440,
    viewportHeight: 956,
  },
  {
    kind: 'mobile',
    id: 'tablet-ipad',
    name: 'iPad',
    group: 'ipad',
    deviceMode: 'mobile',
    frameStyle: 'tablet',
    viewportWidth: 768,
    viewportHeight: 1024,
  },
  {
    kind: 'mobile',
    id: 'tablet-ipad-pro',
    name: 'iPad Pro 12.9″',
    group: 'ipad',
    deviceMode: 'mobile',
    frameStyle: 'tablet',
    viewportWidth: 1024,
    viewportHeight: 1366,
  },
];

export const DEVICE_PRESETS: readonly DevicePreset[] = [
  ...DESKTOP_RESOLUTION_PRESETS,
  ...MOBILE_DEVICE_PRESETS,
];

export const DEFAULT_SETTINGS: CaptureSettings = {
  outputWidth: FULL_HD_PRESET.outputWidth,
  outputHeight: FULL_HD_PRESET.outputHeight,
  viewportWidth: FULL_HD_PRESET.viewportWidth,
  viewportHeight: FULL_HD_PRESET.viewportHeight,
  deviceMode: 'desktop',
  frameStyle: 'browser',
  margin: FULL_HD_PRESET.margin,
  cornerRadius: 8,
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

export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: 'mint-pearl',
    name: 'Mint Pearl',
    from: '#e3f2e8',
    to: '#ebf5ed',
    angle: 135,
    backgroundStyle: 'soft',
  },
  {
    id: 'lavender-mint',
    name: 'Lavender Mint',
    from: '#e1e7f9',
    to: '#ddf7f8',
    angle: 135,
    backgroundStyle: 'soft',
  },
  {
    id: 'blush-cream',
    name: 'Blush Cream',
    from: '#f8e3ee',
    to: '#f9f3dc',
    angle: 145,
    backgroundStyle: 'soft',
  },
  {
    id: 'sky-lilac',
    name: 'Sky Lilac',
    from: '#d2e9f9',
    to: '#e7d7f9',
    angle: 125,
    backgroundStyle: 'soft',
  },
  {
    id: 'warm-paper',
    name: 'Warm Paper',
    from: '#f9ecdc',
    to: '#f8f5d8',
    angle: 150,
    backgroundStyle: 'soft',
  },
  {
    id: 'quiet-gray',
    name: 'Quiet Gray',
    from: '#e4ebf1',
    to: '#ebf0f5',
    angle: 135,
    backgroundStyle: 'soft',
  },
  {
    id: 'sea-glass-flow',
    name: 'Sea Glass Flow',
    from: '#d9f2ec',
    to: '#dce7fb',
    angle: 128,
    backgroundStyle: 'fluid',
  },
  {
    id: 'orchid-tide',
    name: 'Orchid Tide',
    from: '#eadcf7',
    to: '#d9edf5',
    angle: 118,
    backgroundStyle: 'fluid',
  },
  {
    id: 'rosewater-ink',
    name: 'Rosewater Ink',
    from: '#f6dde8',
    to: '#f5e8d7',
    angle: 148,
    backgroundStyle: 'fluid',
  },
  {
    id: 'apricot-lilac',
    name: 'Apricot Lilac',
    from: '#f7e0cf',
    to: '#e6ddf6',
    angle: 155,
    backgroundStyle: 'fluid',
  },
];

export function cloneSettings(settings: CaptureSettings): CaptureSettings {
  return { ...settings };
}

export function migrateV2Settings(
  settings: CaptureSettings,
): CaptureSettings {
  return {
    ...settings,
    cornerRadius:
      settings.cornerRadius === 28 ? 8 : settings.cornerRadius,
  };
}

export function migrateV3Settings(
  settings: CaptureSettings,
): CaptureSettings {
  return {
    ...settings,
    margin: settings.margin === 8 ? 32 : settings.margin,
  };
}

export function devicePresetsFor(
  deviceMode: 'desktop',
): readonly DesktopResolutionPreset[];
export function devicePresetsFor(
  deviceMode: 'mobile',
): readonly MobileDevicePreset[];
export function devicePresetsFor(
  deviceMode: DeviceMode,
): readonly DevicePreset[];
export function devicePresetsFor(
  deviceMode: DeviceMode,
): readonly DevicePreset[] {
  return deviceMode === 'desktop'
    ? DESKTOP_RESOLUTION_PRESETS
    : MOBILE_DEVICE_PRESETS;
}

export function findDevicePreset(
  settings: Pick<
    CaptureSettings,
    | 'deviceMode'
    | 'frameStyle'
    | 'margin'
    | 'outputWidth'
    | 'outputHeight'
    | 'viewportWidth'
    | 'viewportHeight'
    | 'showUrl'
  >,
): DevicePreset | undefined {
  if (settings.deviceMode === 'desktop') {
    return DESKTOP_RESOLUTION_PRESETS.find(
      (preset) =>
        preset.frameStyle === settings.frameStyle &&
        preset.margin === settings.margin &&
        preset.outputWidth === settings.outputWidth &&
        preset.outputHeight === settings.outputHeight &&
        preset.viewportWidth === settings.viewportWidth &&
        preset.viewportHeight === settings.viewportHeight &&
        settings.showUrl,
    );
  }

  return MOBILE_DEVICE_PRESETS.find(
    (preset) =>
      preset.frameStyle === settings.frameStyle &&
      preset.viewportWidth === settings.viewportWidth &&
      preset.viewportHeight === settings.viewportHeight &&
      !settings.showUrl,
  );
}

export function applyDevicePreset(
  settings: CaptureSettings,
  preset: DevicePreset,
): CaptureSettings {
  if (preset.kind === 'desktop') {
    const scaledViewportPixels =
      preset.viewportWidth *
      settings.captureScale *
      preset.viewportHeight *
      settings.captureScale;

    return {
      ...settings,
      outputWidth: preset.outputWidth,
      outputHeight: preset.outputHeight,
      viewportWidth: preset.viewportWidth,
      viewportHeight: preset.viewportHeight,
      deviceMode: preset.deviceMode,
      frameStyle: preset.frameStyle,
      margin: preset.margin,
      captureScale:
        scaledViewportPixels > MAX_CAPTURE_PIXELS
          ? 1
          : settings.captureScale,
      showUrl: true,
    };
  }

  return {
    ...settings,
    deviceMode: preset.deviceMode,
    frameStyle: preset.frameStyle,
    viewportWidth: preset.viewportWidth,
    viewportHeight: preset.viewportHeight,
    showUrl: false,
  };
}

export function applyCustomDeviceMode(
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
