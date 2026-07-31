import frameShotMarkUrl from '../../../assets/frameshot-mark.svg';
import type { TransientNotice } from '../hooks/useTransientNotice';
import {
  AlertIcon,
  CheckIcon,
  SparklesIcon,
  XIcon,
} from './Icons';
import './HeaderFeedback.css';

export type HeaderBusyAction = 'navigate' | 'export' | 'session' | null;

interface HeaderFeedbackProps {
  busy: HeaderBusyAction;
  notice: TransientNotice | null;
  navigationError: string | null;
  onDismissNotice: () => void;
  onRetryNavigation: () => void;
}

type FeedbackContent = {
  kind: 'busy' | 'success' | 'error' | 'info' | 'navigation-error';
  label: string;
  message: string;
  role: 'alert' | 'status';
};

function busyMessage(busy: Exclude<HeaderBusyAction, null>): string {
  if (busy === 'export') {
    return '最新のページから画像を書き出しています…';
  }
  if (busy === 'navigate') return 'ページを開いています…';
  return '処理しています…';
}

function resolveFeedback(
  busy: HeaderBusyAction,
  notice: TransientNotice | null,
  navigationError: string | null,
): FeedbackContent | null {
  if (busy) {
    return {
      kind: 'busy',
      label: '処理中',
      message: busyMessage(busy),
      role: 'status',
    };
  }
  if (notice) {
    return {
      kind: notice.kind,
      label:
        notice.kind === 'success'
          ? '完了'
          : notice.kind === 'error'
            ? 'エラー'
            : 'お知らせ',
      message: notice.message,
      role: notice.kind === 'error' ? 'alert' : 'status',
    };
  }
  if (navigationError) {
    return {
      kind: 'navigation-error',
      label: 'ページを表示できませんでした',
      message: navigationError,
      role: 'alert',
    };
  }
  return null;
}

function FeedbackIcon({
  kind,
}: Pick<FeedbackContent, 'kind'>): React.JSX.Element {
  if (kind === 'busy') {
    return <span className="header-feedback-spinner" aria-hidden="true" />;
  }
  if (kind === 'success') return <CheckIcon />;
  if (kind === 'info') return <SparklesIcon />;
  return <AlertIcon />;
}

export function HeaderFeedback({
  busy,
  notice,
  navigationError,
  onDismissNotice,
  onRetryNavigation,
}: HeaderFeedbackProps): React.JSX.Element {
  const feedback = resolveFeedback(busy, notice, navigationError);

  return (
    <div className="brand" aria-label="FrameShot">
      <img
        className="brand-mark"
        src={frameShotMarkUrl}
        alt=""
        aria-hidden="true"
      />
      <div
        className="header-feedback"
        data-feedback-kind={feedback?.kind ?? 'brand'}
      >
        {feedback ? (
          <div
            className={`header-feedback-content ${feedback.kind}`}
            role={feedback.role}
            aria-label={`${feedback.label}: ${feedback.message}`}
            aria-atomic="true"
            title={feedback.message}
          >
            <span className="header-feedback-icon">
              <FeedbackIcon kind={feedback.kind} />
            </span>
            <span className="header-feedback-copy">
              <b>{feedback.label}</b>
              <span>{feedback.message}</span>
            </span>
            {feedback.kind === 'navigation-error' && (
              <button
                className="header-feedback-action"
                type="button"
                aria-label="キャッシュ無視で再試行"
                title="キャッシュ無視で再試行"
                onClick={onRetryNavigation}
              >
                再試行
              </button>
            )}
            {notice && feedback.kind === notice.kind && (
              <button
                className="header-feedback-dismiss"
                type="button"
                aria-label="閉じる"
                onClick={onDismissNotice}
              >
                <XIcon />
              </button>
            )}
          </div>
        ) : (
          <span className="brand-copy">
            <strong>FrameShot</strong>
            <small>Promo screenshot studio</small>
          </span>
        )}
      </div>
    </div>
  );
}
