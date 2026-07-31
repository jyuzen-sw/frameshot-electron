import { createElement, type Dispatch, type SetStateAction } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/presets';
import type { CaptureSettings } from '../../src/shared/types';
import { SettingsPanel } from '../../src/renderer/components/SettingsPanel';
import { ViewportMenuList } from '../../src/renderer/components/Toolbar';

function buttonMarkup(markup: string, label: string): string {
  const button = Array.from(
    markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g),
  )
    .map((match) => match[0])
    .find(
      (candidate) =>
        candidate.includes(`<span>${label}</span>`) ||
        candidate.includes(`<b>${label}</b>`),
    );
  if (!button) throw new Error(`${label} button was not rendered.`);
  return button;
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
        focusViewportRequest: 0,
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
        },
        onViewportPreset: vi.fn(),
        onCustomViewport: vi.fn(),
        onDismiss: vi.fn(),
      }),
    );

    expect(markup.match(/role="menuitemradio"/g)).toHaveLength(8);
    expect(buttonMarkup(markup, 'iPad Pro 12.9″')).toContain(
      'aria-checked="true"',
    );
    expect(buttonMarkup(markup, 'Phone')).toContain(
      'aria-checked="false"',
    );
    expect(markup).toContain(
      'role="group" aria-labelledby="viewport-mobile-phone-heading"',
    );
    expect(markup).toContain(
      'id="viewport-mobile-phone-heading">Phone</span>',
    );
    expect(markup).not.toContain('aria-label="Phone presets"');
    expect(markup).not.toContain('aria-label="選択中"');
  });
});
