export type FrameStyle = 'browser' | 'phone' | 'none';
export type DeviceMode = 'desktop' | 'mobile';
export type BackgroundStyle = 'soft' | 'clean';
export type CaptureScale = 1 | 2;
export type AppMode = 'live' | 'preview';
export type AppCommand = 'capture' | 'save' | 'focus-url' | 'reload-target';

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

export interface CapturePreset {
  id: string;
  name: string;
  description: string;
  settings: CaptureSettings;
}

export interface GradientPreset {
  id: string;
  name: string;
  from: string;
  to: string;
  angle: number;
}

export interface CustomPreset {
  id: string;
  name: string;
  settings: CaptureSettings;
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

export interface CaptureResult {
  dataUrl: string;
  width: number;
  height: number;
  capturedAt: string;
}

export interface SaveCaptureResult {
  saved: boolean;
  path?: string;
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
  capture: (settings: CaptureSettings) => Promise<CaptureResult>;
  recompose: (settings: CaptureSettings) => Promise<CaptureResult>;
  saveCapture: () => Promise<SaveCaptureResult>;
  copyCapture: () => Promise<void>;
  resetSession: () => Promise<void>;
  openTargetDevTools: () => Promise<void>;
  getPreferences: () => Promise<UserPreferences>;
  setCertificateAllowed: (
    host: string,
    allowed: boolean,
  ) => Promise<UserPreferences>;
  onNavigationState: (listener: (state: NavigationState) => void) => () => void;
  onAppCommand: (listener: (command: AppCommand) => void) => () => void;
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
