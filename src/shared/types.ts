export type FrameStyle = 'browser' | 'phone' | 'none';
export type DeviceMode = 'desktop' | 'mobile';
export type BackgroundStyle = 'soft' | 'clean';
export type CaptureScale = 1 | 2;
export type ExportDestination = 'clipboard' | 'file';
export type AppShortcut = 'save' | 'focus-url' | 'reload-target';

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

export interface ViewportPreset {
  id: string;
  name: string;
  deviceMode: DeviceMode;
  width: number;
  height: number;
}

export interface GradientPreset {
  id: string;
  name: string;
  from: string;
  to: string;
  angle: number;
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
}
