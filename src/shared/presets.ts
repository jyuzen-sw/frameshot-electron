import type {
  CapturePreset,
  CaptureSettings,
  GradientPreset,
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
  gradientFrom: '#f1faf4',
  gradientTo: '#f8fcf9',
  gradientAngle: 135,
  backgroundStyle: 'soft',
  captureScale: 2,
  waitMs: 500,
  hideScrollbars: true,
  pauseAnimations: false,
  showUrl: true,
};

export const CAPTURE_PRESETS: CapturePreset[] = [
  {
    id: 'desktop-hero',
    name: 'Desktop Hero',
    description: 'Webサイトやストア掲載の横長ヒーロー画像',
    settings: { ...DEFAULT_SETTINGS },
  },
  {
    id: 'mobile-store',
    name: 'Mobile Portrait',
    description: 'スマホ枠を使った縦長の宣伝画像',
    settings: {
      ...DEFAULT_SETTINGS,
      outputWidth: 1080,
      outputHeight: 1350,
      viewportWidth: 390,
      viewportHeight: 844,
      deviceMode: 'mobile',
      frameStyle: 'phone',
      margin: 32,
      cornerRadius: 34,
      shadow: 68,
      gradientFrom: '#fdf2f8',
      gradientTo: '#fffbeb',
      gradientAngle: 145,
      showUrl: false,
    },
  },
  {
    id: 'square-promotion',
    name: 'Square Promotion',
    description: 'SNSや製品紹介カード向けの正方形',
    settings: {
      ...DEFAULT_SETTINGS,
      outputWidth: 1600,
      outputHeight: 1600,
      viewportWidth: 1280,
      viewportHeight: 800,
      margin: 32,
      gradientFrom: '#e0f2fe',
      gradientTo: '#f3e8ff',
      gradientAngle: 125,
    },
  },
  {
    id: 'social-card',
    name: 'Social Card',
    description: 'OGPやSNS投稿向けの1200×630',
    settings: {
      ...DEFAULT_SETTINGS,
      outputWidth: 1200,
      outputHeight: 630,
      viewportWidth: 1280,
      viewportHeight: 720,
      margin: 32,
      cornerRadius: 22,
      shadow: 55,
    },
  },
  {
    id: 'clean-window',
    name: 'Clean Window',
    description: '枠を外してWebページだけを柔らかく配置',
    settings: {
      ...DEFAULT_SETTINGS,
      frameStyle: 'none',
      margin: 32,
      cornerRadius: 30,
      showUrl: false,
      backgroundStyle: 'clean',
    },
  },
];

export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: 'mint-pearl',
    name: 'Mint Pearl',
    from: '#f1faf4',
    to: '#f8fcf9',
    angle: 135,
  },
  {
    id: 'lavender-mint',
    name: 'Lavender Mint',
    from: '#eef2ff',
    to: '#ecfeff',
    angle: 135,
  },
  {
    id: 'blush-cream',
    name: 'Blush Cream',
    from: '#fdf2f8',
    to: '#fffbeb',
    angle: 145,
  },
  {
    id: 'sky-lilac',
    name: 'Sky Lilac',
    from: '#e0f2fe',
    to: '#f3e8ff',
    angle: 125,
  },
  {
    id: 'warm-paper',
    name: 'Warm Paper',
    from: '#fff7ed',
    to: '#fefce8',
    angle: 150,
  },
  {
    id: 'quiet-gray',
    name: 'Quiet Gray',
    from: '#f1f5f9',
    to: '#f8fafc',
    angle: 135,
  },
];

export function cloneSettings(settings: CaptureSettings): CaptureSettings {
  return { ...settings };
}
