import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HeaderFeedback } from '../../src/renderer/components/HeaderFeedback';
import type { TransientNotice } from '../../src/renderer/hooks/useTransientNotice';

interface RenderFeedbackOptions {
  busy?: 'export' | 'session' | null;
  navigationLoading?: boolean;
  notice?: TransientNotice | null;
  navigationError?: string | null;
}

function renderFeedback({
  busy = null,
  navigationLoading = false,
  notice = null,
  navigationError = null,
}: RenderFeedbackOptions = {}): string {
  return renderToStaticMarkup(
    createElement(HeaderFeedback, {
      busy,
      navigationLoading,
      notice,
      navigationError,
      onDismissNotice: vi.fn(),
      onRetryNavigation: vi.fn(),
    }),
  );
}

describe('HeaderFeedback', () => {
  it('keeps the official mark visible with the default brand copy', () => {
    const markup = renderFeedback();

    expect(markup).toMatch(
      /class="brand-mark" src="(?:data:image\/svg\+xml[^"]*|[^"]*frameshot-mark[^"]*)"/,
    );
    expect(markup).toContain('data-feedback-kind="brand"');
    expect(markup).toContain('<strong>FrameShot</strong>');
  });

  it('gives busy feedback priority over notices and navigation errors', () => {
    const markup = renderFeedback({
      busy: 'export',
      navigationLoading: true,
      notice: { kind: 'success', message: '保存しました' },
      navigationError: '接続できません',
    });

    expect(markup).toContain('data-feedback-kind="busy"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('最新のページから画像を書き出しています…');
    expect(markup).not.toContain('保存しました');
    expect(markup).not.toContain('接続できません');
    expect(markup).not.toContain('aria-label="閉じる"');
  });

  it('shows page loading independently from exclusive operations', () => {
    const markup = renderFeedback({
      navigationLoading: true,
      notice: { kind: 'info', message: '表示サイズを適用しました' },
      navigationError: '接続できません',
    });

    expect(markup).toContain('data-feedback-kind="busy"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('ページを開いています…');
    expect(markup).not.toContain('表示サイズを適用しました');
    expect(markup).not.toContain('接続できません');
  });

  it('gives a transient notice priority over a navigation error', () => {
    const markup = renderFeedback({
      notice: { kind: 'info', message: '表示サイズを適用しました' },
      navigationError: '接続できません',
    });

    expect(markup).toContain('data-feedback-kind="info"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('表示サイズを適用しました');
    expect(markup).not.toContain('接続できません');
    expect(markup).toContain('aria-label="閉じる"');
  });

  it.each([
    ['success', 'コピーしました', 'status'],
    ['info', '設定を更新しました', 'status'],
    ['error', '保存できませんでした', 'alert'],
  ] as const)(
    'exposes a %s notice with its full accessible message',
    (kind, message, role) => {
      const markup = renderFeedback({ notice: { kind, message } });

      expect(markup).toContain(`data-feedback-kind="${kind}"`);
      expect(markup).toContain(`role="${role}"`);
      const label =
        kind === 'success'
          ? '完了'
          : kind === 'error'
            ? 'エラー'
            : 'お知らせ';
      expect(markup).toContain(`aria-label="${label}: ${message}"`);
      expect(markup).toContain(`title="${message}"`);
    },
  );

  it('shows navigation errors as retryable alerts after notices clear', () => {
    const markup = renderFeedback({
      navigationError: 'net::ERR_CONNECTION_REFUSED',
    });

    expect(markup).toContain('data-feedback-kind="navigation-error"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(
      'aria-label="ページを表示できませんでした: net::ERR_CONNECTION_REFUSED"',
    );
    expect(markup).toContain('ページを表示できませんでした');
    expect(markup).toContain('aria-label="キャッシュ無視で再試行"');
    expect(markup).toContain('>再試行</button>');
    expect(markup).not.toContain('aria-label="閉じる"');
  });
});
