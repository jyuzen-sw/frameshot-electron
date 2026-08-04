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
    expect(markup).toContain('Webビューサイズ');
    expect(markup).toContain(
      'フレームと余白を含む完成画像のサイズ。ページviewportは自動計算します',
    );
    expect(markup).toContain('aria-label="Webビューサイズ 幅"');
    expect(markup).not.toContain('スクリーンショットサイズ');
    expect(markup).not.toContain('ページ表示サイズ');
    expect(markup).toContain('aria-label="余白プリセット"');
    expect(buttonMarkup(markup, '余白 32px')).toContain(
      'aria-pressed="true"',
    );
    expect(labelledControlMarkup(markup, '余白 Custom')).toContain(
      'max="420"',
    );
    expect(markup).toContain('書き出し予定 1920 × 1080');
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
      'aria-label="Phone Webビューサイズプリセット"',
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

  it('presents one editable mobile Web view size and its derived output', () => {
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
        onClose: vi.fn(),
        onSettingsChange: vi.fn(),
        onCertificateAllowed: vi.fn(),
        onResetSession: vi.fn(),
        onOpenDevTools: vi.fn(),
      }),
    );

    expect(markup).toContain('<em>mobile</em>');
    expect(markup).toContain(
      'Webページの論理viewport。端末フレームと余白は書き出し時に自動加算します',
    );
    expect(
      labelledControlMarkup(markup, 'Webビューサイズ 幅'),
    ).not.toContain('readonly');
    expect(markup.match(/aria-label="Webビューサイズ 幅"/g)).toHaveLength(1);
    expect(markup).toContain('書き出し予定 924 × 1868');
    expect(markup).toContain(
      '<select disabled=""><option value="1">1× 標準</option><option value="2" selected="">2× 高精細</option></select>',
    );
  });

  it('groups Full HD and lower desktop choices separately from high resolutions', () => {
    const markup = renderToStaticMarkup(
      createElement(ViewportMenuList, {
        deviceMode: 'desktop',
        settings: DEFAULT_SETTINGS,
        onDevicePreset: vi.fn(),
        onCustomSize: vi.fn(),
        onDismiss: vi.fn(),
      }),
    );

    expect(markup.match(/role="menuitemradio"/g)).toHaveLength(9);
    expect(markup).toContain(
      'aria-label="Desktop Webビューサイズプリセット"',
    );
    expect(markup).toContain(
      'id="viewport-desktop-full-hd-and-below-heading">Full HD以下</span>',
    );
    expect(markup).toContain(
      'id="viewport-desktop-high-resolution-heading">高解像度</span>',
    );
    expect(buttonMarkup(markup, 'Full HD')).toContain(
      '1920 × 1080',
    );
    expect(buttonMarkup(markup, 'Full HD')).toContain(
      'aria-checked="true"',
    );
    expect(buttonMarkup(markup, 'Desktop')).toContain('1440 × 900');
    expect(buttonMarkup(markup, '<b>HD</b>')).toContain('1280 × 720');
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
