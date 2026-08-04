import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/presets';
import type { NavigationState } from '../../src/shared/types';
import { AppHeader } from '../../src/renderer/components/AppHeader';
import type { HeaderBusyAction } from '../../src/renderer/components/HeaderFeedback';

function labelledButtonMarkup(markup: string, label: string): string {
  const button = markup.match(
    new RegExp(`<button\\b[^>]*aria-label="${label}"[^>]*>`),
  )?.[0];
  if (!button) throw new Error(`${label} button was not rendered.`);
  return button;
}

function textButtonMarkup(markup: string, text: string): string {
  const button = Array.from(
    markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g),
  )
    .map((match) => match[0])
    .find((candidate) => candidate.includes(`>${text}</button>`));
  if (!button) throw new Error(`${text} button was not rendered.`);
  return button;
}

function renderHeader(
  navigation: NavigationState,
  busy: HeaderBusyAction = null,
): string {
  return renderToStaticMarkup(
    createElement(AppHeader, {
      url: navigation.url,
      urlInputRef: createRef<HTMLInputElement>(),
      settingsButtonRef: createRef<HTMLButtonElement>(),
      navigation,
      settings: DEFAULT_SETTINGS,
      busy,
      notice: null,
      settingsOpen: false,
      openViewportMenu: null,
      onUrlChange: vi.fn(),
      onNavigate: vi.fn(),
      onBack: vi.fn(),
      onForward: vi.fn(),
      onReload: vi.fn(),
      onStop: vi.fn(),
      onNavigationRetry: vi.fn(),
      onNoticeDismiss: vi.fn(),
      onDevicePreset: vi.fn(),
      onCustomSize: vi.fn(),
      onViewportMenuOpen: vi.fn(),
      onViewportMenuDismiss: vi.fn(),
      onCopy: vi.fn(),
      onSave: vi.fn(),
      onSettingsToggle: vi.fn(),
    }),
  );
}

const READY_NAVIGATION: NavigationState = {
  url: 'http://127.0.0.1:4321/ready',
  title: 'Ready',
  isLoading: false,
  canGoBack: true,
  canGoForward: false,
};

describe('AppHeader navigation controls', () => {
  it('allows a pending page to be stopped or replaced without enabling export', () => {
    const markup = renderHeader({
      ...READY_NAVIGATION,
      title: '',
      isLoading: true,
    });

    expect(labelledButtonMarkup(markup, '読み込みを中止')).not.toContain(
      'disabled',
    );
    expect(markup).not.toContain('aria-label="再読み込み"');
    expect(textButtonMarkup(markup, '開く')).not.toContain('disabled');
    expect(labelledButtonMarkup(markup, '画像をコピー')).toContain('disabled');
    expect(labelledButtonMarkup(markup, 'PNGを保存')).toContain('disabled');
    expect(markup).toContain('data-feedback-kind="busy"');
    expect(markup).toContain('ページを開いています…');
  });

  it('restores reload and export actions after loading finishes', () => {
    const markup = renderHeader(READY_NAVIGATION);

    expect(labelledButtonMarkup(markup, '再読み込み')).not.toContain(
      'disabled',
    );
    expect(markup).not.toContain('aria-label="読み込みを中止"');
    expect(labelledButtonMarkup(markup, '画像をコピー')).not.toContain(
      'disabled',
    );
    expect(labelledButtonMarkup(markup, 'PNGを保存')).not.toContain(
      'disabled',
    );
  });

  it('keeps exclusive operations ahead of page loading controls', () => {
    const markup = renderHeader(
      { ...READY_NAVIGATION, isLoading: true },
      'export',
    );

    expect(labelledButtonMarkup(markup, '読み込みを中止')).toContain(
      'disabled',
    );
    expect(textButtonMarkup(markup, '開く')).toContain('disabled');
    expect(markup).toContain('最新のページから画像を書き出しています…');
    expect(markup).not.toContain('ページを開いています…');
  });
});
