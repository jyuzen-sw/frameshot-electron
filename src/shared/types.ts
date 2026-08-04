export type FrameStyle = 'browser' | 'phone' | 'tablet' | 'none';
export type DeviceMode = 'desktop' | 'mobile';
export type BackgroundStyle = 'soft' | 'clean' | 'fluid';
export type CaptureScale = 1 | 2;
export type ExportDestination = 'clipboard' | 'file';
export type AppShortcut = 'save' | 'focus-url' | 'reload-target';
export type MobileDeviceGroup = 'android' | 'iphone' | 'ipad';
export type DesktopResolutionGroup = 'full-hd-and-below' | 'high-resolution';
export type PhoneFrameVariant = 'android' | 'iphone';

export interface ViewportSpec {
  width: number;
  height: number;
  mode: DeviceMode;
}

export interface CaptureSettings {
  outputWidth: number;
  outputHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  deviceMode: DeviceMode;
  frameStyle: FrameStyle;
  phoneFrameVariant: PhoneFrameVariant;
  margin: number;
  cornerRadius: number;
  shadow: number;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
  backgroundStyle: BackgroundStyle;
  captureScale: CaptureScale;
  waitMs: number;
  hideScrollbars: boolean;
  pauseAnimations: boolean;
  showUrl: boolean;
}

export interface DesktopResolutionPreset {
  kind: 'desktop';
  id: string;
  name: string;
  group: DesktopResolutionGroup;
  deviceMode: 'desktop';
  frameStyle: 'browser';
  outputWidth: number;
  outputHeight: number;
}

export interface MobileDevicePreset {
  kind: 'mobile';
  id: string;
  name: string;
  group: MobileDeviceGroup;
  deviceMode: 'mobile';
  frameStyle: 'phone' | 'tablet';
  viewportWidth: number;
  viewportHeight: number;
}

export type DevicePreset = DesktopResolutionPreset | MobileDevicePreset;

export interface GradientPreset {
  id: string;
  name: string;
  from: string;
  to: string;
  angle: number;
  backgroundStyle: BackgroundStyle;
}

export interface TargetViewLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
  visible: boolean;
  viewport: ViewportSpec;
}

export interface NavigationState {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error?: string;
}

export interface ExportResult {
  destination: ExportDestination;
  completed: boolean;
  width: number;
  height: number;
  exportedAt?: string;
  path?: string;
}

export interface ExportRenderPayload {
  settings: CaptureSettings;
  pageImageUrl: string;
  targetUrl: string;
}

export interface UserPreferences {
  allowedCertificateHosts: string[];
}

export interface FrameShotApi {
  navigate: (url: string) => Promise<NavigationState>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  reload: (ignoreCache?: boolean) => Promise<void>;
  setTargetLayout: (layout: TargetViewLayout) => void;
  exportImage: (
    settings: CaptureSettings,
    destination: ExportDestination,
  ) => Promise<ExportResult>;
  resetSession: () => Promise<void>;
  openTargetDevTools: () => Promise<void>;
  getPreferences: () => Promise<UserPreferences>;
  setCertificateAllowed: (
    host: string,
    allowed: boolean,
  ) => Promise<UserPreferences>;
  onNavigationState: (listener: (state: NavigationState) => void) => () => void;
  onAppShortcut: (listener: (shortcut: AppShortcut) => void) => () => void;
}

export interface CompositionLayout {
  scale: number;
  artboard: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  };
  screen: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
  };
  browserBarHeight: number;
  browserAddressHeight: number;
  phoneBezel: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  tabletBezel: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}
