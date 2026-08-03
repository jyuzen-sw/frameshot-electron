import type { RefObject } from 'react';
import type {
  CaptureSettings,
  DeviceMode,
  NavigationState,
  ViewportPreset,
} from '@shared/types';
import type { TransientNotice } from '../hooks/useTransientNotice';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CopyIcon,
  ReloadIcon,
  SaveIcon,
  SlidersIcon,
} from './Icons';
import {
  HeaderFeedback,
  type HeaderBusyAction,
} from './HeaderFeedback';
import { ViewportMenu } from './ViewportMenu';
import './AppHeader.css';

interface AppHeaderProps {
  url: string;
  urlInputRef: RefObject<HTMLInputElement | null>;
  settingsButtonRef: RefObject<HTMLButtonElement | null>;
  navigation: NavigationState;
  settings: CaptureSettings;
  busy: HeaderBusyAction;
  notice: TransientNotice | null;
  settingsOpen: boolean;
  openViewportMenu: DeviceMode | null;
  onUrlChange: (value: string) => void;
  onNavigate: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onNavigationRetry: () => void;
  onNoticeDismiss: () => void;
  onViewportPreset: (preset: ViewportPreset) => void;
  onCustomViewport: (deviceMode: DeviceMode) => void;
  onViewportMenuOpen: (deviceMode: DeviceMode) => void;
  onViewportMenuDismiss: (deviceMode: DeviceMode) => void;
  onCopy: () => void;
  onSave: () => void;
  onSettingsToggle: () => void;
}

export function AppHeader({
  url,
  urlInputRef,
  settingsButtonRef,
  navigation,
  settings,
  busy,
  notice,
  settingsOpen,
  openViewportMenu,
  onUrlChange,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onNavigationRetry,
  onNoticeDismiss,
  onViewportPreset,
  onCustomViewport,
  onViewportMenuOpen,
  onViewportMenuDismiss,
  onCopy,
  onSave,
  onSettingsToggle,
}: AppHeaderProps): React.JSX.Element {
  const isBusy = busy !== null;

  return (
    <header className="toolbar app-header">
      <HeaderFeedback
        busy={busy}
        notice={notice}
        navigationError={navigation.error ?? null}
        onDismissNotice={onNoticeDismiss}
        onRetryNavigation={onNavigationRetry}
      />

      <div className="toolbar-browser-group">
        <nav className="nav-controls" aria-label="ページ操作">
          <button
            className="icon-button"
            type="button"
            aria-label="戻る"
            disabled={!navigation.canGoBack || isBusy}
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="進む"
            disabled={!navigation.canGoForward || isBusy}
            onClick={onForward}
          >
            <ArrowRightIcon />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="再読み込み"
            disabled={!navigation.url || isBusy}
            onClick={onReload}
          >
            <ReloadIcon className={navigation.isLoading ? 'spin' : ''} />
          </button>
        </nav>

        <form
          className={`url-form ${navigation.error ? 'has-error' : ''}`}
          onSubmit={(event) => {
            event.preventDefault();
            onNavigate();
          }}
        >
          <span
            className={`connection-dot ${
              navigation.isLoading
                ? 'loading'
                : navigation.error
                  ? 'error'
                  : navigation.url
                    ? 'ready'
                    : ''
            }`}
          />
          <input
            ref={urlInputRef}
            aria-label="URL"
            value={url}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="http://localhost:4321"
            onChange={(event) => onUrlChange(event.target.value)}
          />
          <button type="submit" disabled={isBusy || !url.trim()}>
            開く
          </button>
        </form>
        <output className="navigation-status" aria-live="polite">
          {navigation.title}
        </output>
      </div>

      <ViewportMenu
        settings={settings}
        openMenu={openViewportMenu}
        onViewportPreset={onViewportPreset}
        onCustomViewport={onCustomViewport}
        onMenuOpen={onViewportMenuOpen}
        onMenuDismiss={onViewportMenuDismiss}
      />

      <div className="toolbar-actions" aria-label="書き出しと設定">
        <div className="toolbar-export-actions">
          <button
            className="toolbar-icon-action toolbar-copy-action"
            type="button"
            aria-label="画像をコピー"
            title="画像をコピー"
            disabled={!navigation.url || isBusy}
            onClick={onCopy}
          >
            <CopyIcon />
            <span>コピー</span>
          </button>
          <button
            className="toolbar-icon-action toolbar-save-action"
            type="button"
            aria-label="PNGを保存"
            title="PNGを保存"
            disabled={!navigation.url || isBusy}
            onClick={onSave}
          >
            <SaveIcon />
            <span>保存</span>
          </button>
        </div>

        <button
          ref={settingsButtonRef}
          className={`toolbar-icon-action toolbar-settings-action ${
            settingsOpen ? 'active' : ''
          }`}
          data-settings-trigger="true"
          type="button"
          aria-label={settingsOpen ? '詳細設定を閉じる' : '詳細設定を開く'}
          aria-expanded={settingsOpen}
          aria-controls="settings-panel"
          title={settingsOpen ? '詳細設定を閉じる' : '詳細設定を開く'}
          onClick={onSettingsToggle}
        >
          <SlidersIcon />
          <span>設定</span>
        </button>
      </div>
    </header>
  );
}
