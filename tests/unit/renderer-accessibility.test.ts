import { createElement, type Dispatch, type SetStateAction } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  GRADIENT_PRESETS,
  MOBILE_DEVICE_PRESETS,
  applyDevicePreset,
} from '../../src/shared/presets';
import type { CaptureSettings } from '../../src/shared/types';
import { SettingsPanel } from '../../src/renderer/components/SettingsPanel';
import { ViewportMenuList } from '../../src/renderer/components/ViewportMenu';

function buttonMarkup(markup: string, label: string): string {
  const button = Array.from(
    markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g),
  )
    .map((match) => match[0])
    .find((candidate) => candidate.includes(label));
  if (!button) throw new Error(`${label} button was not rendered.`);
  return button;
}

function labelledControlMarkup(markup: string, label: string): string {
  const tag = markup.match(
    new RegExp(`<(?:input|select)\\b[^>]*aria-label="${label}"[^>]*>`),
  )?.[0];
  if (!tag) throw new Error(`${label} control was not rendered.`);
  return tag;
}

describe('renderer selection accessibility', () => {
  it('exposes each frame button as a toggle with one selected value', () => {
    const onSettingsChange: Dispatch<
      SetStateAction<CaptureSettings>
    > = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(SettingsPanel, {
        settings: { ...DEFAULT_SETTINGS, frameStyle: 'tablet' },
        currentHost: null,
        certificateAllowed: false,
        focusSizeRequest: 0,
        focusSizeTarget: 'page',
        onClose: vi.fn(),
        onSettingsChange,
        onCertificateAllowed: vi.fn(),
        onResetSession: vi.fn(),
        onOpenDevTools: vi.fn(),
      }),
    );

    expect(buttonMarkup(markup, 'Browser')).toContain(
      'aria-pressed="false"',
    );
    expect(buttonMarkup(markup, 'Phone')).toContain(
      'aria-pressed="false"',
    );
    expect(buttonMarkup(markup, 'Tablet')).toContain(
      'aria-pressed="true"',
    );
    expect(buttonMarkup(markup, 'None')).toContain(
      'aria-pressed="false"',
    );
    expect(markup).toContain('スクリーンショットサイズ');
    expect(markup).toContain(
      '背景・余白・フレームを含む画像全体の最大サイズと縦横比',
    );
    expect(markup).toContain('ページ表示サイズ');
    expect(markup).toContain('aria-label="スクリーンショットサイズ 幅"');
    expect(markup).toContain('aria-label="ページ表示サイズ 幅"');
    expect(markup).toContain('書き出し予定 1920 × 1048');
  });

  it('uses a single labelled radio group for viewport choices', () => {
    const markup = renderToStaticMarkup(
      createElement(ViewportMenuList, {
        deviceMode: 'mobile',
        settings: {
          ...DEFAULT_SETTINGS,
          deviceMode: 'mobile',
          frameStyle: 'tablet',
          viewportWidth: 1024,
          viewportHeight: 1366,
          showUrl: false,
        },
        onDevicePreset: vi.fn(),
        onCustomSize: vi.fn(),
        onDismiss: vi.fn(),
      }),
    );

    expect(markup.match(/role="menuitemradio"/g)).toHaveLength(7);
    expect(markup).toContain(
      'aria-label="Phone ページ表示サイズプリセット"',
    );
    expect(buttonMarkup(markup, 'iPad Pro 12.9″')).toContain(
      'aria-checked="true"',
    );
    expect(buttonMarkup(markup, 'Google Pixel 10')).toContain(
      'aria-checked="false"',
    );
    expect(markup).toContain(
      'role="group" aria-labelledby="viewport-mobile-android-heading"',
    );
    expect(markup).toContain(
      'id="viewport-mobile-android-heading">Android</span>',
    );
    expect(markup).toContain(
      'id="viewport-mobile-iphone-heading">iPhone</span>',
    );
    expect(markup).toContain(
      'id="viewport-mobile-ipad-heading">iPad</span>',
    );
    expect(markup).not.toContain('aria-label="選択中"');
  });

  it('presents mobile output size as automatic and keeps page size editable', () => {
    const settings = applyDevicePreset(
      DEFAULT_SETTINGS,
      MOBILE_DEVICE_PRESETS.find((preset) => preset.id === 'iphone-17')!,
    );
    const markup = renderToStaticMarkup(
      createElement(SettingsPanel, {
        settings,
        currentHost: null,
        certificateAllowed: false,
        focusSizeRequest: 0,
        focusSizeTarget: 'page',
        onClose: vi.fn(),
        onSettingsChange: vi.fn(),
        onCertificateAllowed: vi.fn(),
        onResetSession: vi.fn(),
        onOpenDevTools: vi.fn(),
      }),
    );

    expect(markup).toContain('<em>AUTO</em>');
    expect(markup).toContain(
      'ページ・端末フレーム・余白を2×で書き出すサイズ',
    );
    expect(
      labelledControlMarkup(markup, 'スクリーンショットサイズ 幅'),
    ).toContain('readOnly=""');
    expect(
      labelledControlMarkup(markup, 'ページ表示サイズ 幅'),
    ).not.toContain('readonly');
    expect(markup).not.toContain('>16:9</button>');
    expect(markup).toContain('書き出し予定 924 × 1868');
    expect(markup).toContain(
      '<select disabled=""><option value="1">1× 標準</option><option value="2" selected="">2× 高精細</option></select>',
    );
  });

  it('presents desktop choices as screenshot resolutions with page sizes', () => {
    const markup = renderToStaticMarkup(
      createElement(ViewportMenuList, {
        deviceMode: 'desktop',
        settings: DEFAULT_SETTINGS,
        onDevicePreset: vi.fn(),
        onCustomSize: vi.fn(),
        onDismiss: vi.fn(),
      }),
    );

    expect(markup.match(/role="menuitemradio"/g)).toHaveLength(5);
    expect(markup).toContain(
      'aria-label="Desktop スクリーンショットサイズプリセット"',
    );
    expect(markup).toContain(
      'id="viewport-desktop-resolution-heading">画面解像度</span>',
    );
    expect(buttonMarkup(markup, 'Full HD')).toContain(
      '1920 × 1080 · ページ表示サイズ 1856 × 958',
    );
    expect(buttonMarkup(markup, 'Full HD')).toContain(
      'aria-checked="true"',
    );
    expect(markup).not.toContain('<b>Desktop</b>');
  });

  it('offers all ten background swatches and the fluid style selector', () => {
    const onSettingsChange: Dispatch<
      SetStateAction<CaptureSettings>
    > = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(SettingsPanel, {
        settings: {
          ...DEFAULT_SETTINGS,
          gradientFrom: '#f6dde8',
          gradientTo: '#f5e8d7',
          gradientAngle: 148,
          backgroundStyle: 'fluid',
        },
        currentHost: null,
        certificateAllowed: false,
        focusSizeRequest: 0,
        focusSizeTarget: 'page',
        onClose: vi.fn(),
        onSettingsChange,
        onCertificateAllowed: vi.fn(),
        onResetSession: vi.fn(),
        onOpenDevTools: vi.fn(),
      }),
    );

    expect(markup.match(/class="gradient-swatch/g)).toHaveLength(10);
    for (const preset of GRADIENT_PRESETS) {
      expect(markup).toContain(`title="${preset.name}"`);
    }
    expect(buttonMarkup(markup, 'Rosewater Ink')).toContain(
      'class="gradient-swatch background-fluid active"',
    );
    expect(buttonMarkup(markup, 'Rosewater Ink')).toContain(
      'aria-pressed="true"',
    );
    expect(buttonMarkup(markup, 'Fluid ink')).toContain(
      'aria-pressed="true"',
    );
    expect(buttonMarkup(markup, 'Soft glow')).toContain(
      'aria-pressed="false"',
    );
    expect(buttonMarkup(markup, 'Clean')).toContain(
      'aria-pressed="false"',
    );

    const differentStyleMarkup = renderToStaticMarkup(
      createElement(SettingsPanel, {
        settings: {
          ...DEFAULT_SETTINGS,
          gradientFrom: '#f6dde8',
          gradientTo: '#f5e8d7',
          gradientAngle: 148,
          backgroundStyle: 'soft',
        },
        currentHost: null,
        certificateAllowed: false,
        focusSizeRequest: 0,
        focusSizeTarget: 'page',
        onClose: vi.fn(),
        onSettingsChange,
        onCertificateAllowed: vi.fn(),
        onResetSession: vi.fn(),
        onOpenDevTools: vi.fn(),
      }),
    );

    expect(buttonMarkup(differentStyleMarkup, 'Rosewater Ink')).not.toContain(
      'class="gradient-swatch background-fluid active"',
    );
  });
});
