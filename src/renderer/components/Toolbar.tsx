import type { RefObject } from 'react';
import type { AppMode, DeviceMode, NavigationState } from '@shared/types';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  CopyIcon,
  MonitorIcon,
  PhoneIcon,
  ReloadIcon,
  SaveIcon,
  SlidersIcon,
  SparklesIcon,
} from './Icons';

interface ToolbarProps {
  url: string;
  urlInputRef: RefObject<HTMLInputElement | null>;
  navigation: NavigationState;
  mode: AppMode;
  deviceMode: DeviceMode;
  busy: boolean;
  captureAvailable: boolean;
  needsRecompose: boolean;
  viewportChangedSinceCapture: boolean;
  settingsOpen: boolean;
  onUrlChange: (value: string) => void;
  onNavigate: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onDeviceMode: (mode: DeviceMode) => void;
  onCapture: () => void;
  onRecompose: () => void;
  onCopy: () => void;
  onSave: () => void;
  onSettingsToggle: () => void;
  onModeChange: (mode: AppMode) => void;
}

export function Toolbar({
  url,
  urlInputRef,
  navigation,
  mode,
  deviceMode,
  busy,
  captureAvailable,
  needsRecompose,
  viewportChangedSinceCapture,
  settingsOpen,
  onUrlChange,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onDeviceMode,
  onCapture,
  onRecompose,
  onCopy,
  onSave,
  onSettingsToggle,
  onModeChange,
}: ToolbarProps): React.JSX.Element {
  const showRefreshAction = captureAvailable && (needsRecompose || viewportChangedSinceCapture);
  const refreshLabel = viewportChangedSinceCapture ? '再撮影' : '再合成';
  const refreshDisabled = busy || (viewportChangedSinceCapture && !navigation.url);

  return (
    <header className="toolbar">
      <div className="brand" aria-label="FrameShot">
        <span className="brand-mark"><CameraIcon /></span>
        <span className="brand-copy">
          <strong>FrameShot</strong>
          <small>Promo screenshot studio</small>
        </span>
      </div>

      <div className="toolbar-browser-group">
        <nav className="nav-controls" aria-label="ページ操作">
          <button
            className="icon-button"
            type="button"
            aria-label="戻る"
            disabled={!navigation.canGoBack || busy}
            onClick={onBack}
          ><ArrowLeftIcon /></button>
          <button
            className="icon-button"
            type="button"
            aria-label="進む"
            disabled={!navigation.canGoForward || busy}
            onClick={onForward}
          ><ArrowRightIcon /></button>
          <button
            className="icon-button"
            type="button"
            aria-label="再読み込み"
            disabled={!navigation.url || busy}
            onClick={onReload}
          ><ReloadIcon className={navigation.isLoading ? 'spin' : ''} /></button>
        </nav>

        <form
          className={`url-form ${navigation.error ? 'has-error' : ''}`}
          onSubmit={(event) => {
            event.preventDefault();
            onNavigate();
          }}
        >
          <span className={`connection-dot ${navigation.isLoading ? 'loading' : navigation.error ? 'error' : navigation.url ? 'ready' : ''}`} />
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
          <button type="submit" disabled={busy || !url.trim()}>開く</button>
        </form>
        <output className="navigation-status" aria-live="polite">
          {navigation.title}
        </output>
      </div>

      <div className="toolbar-view-group">
        <div className="toolbar-segment" aria-label="デバイス表示">
          <button
            type="button"
            className={deviceMode === 'desktop' ? 'active' : ''}
            onClick={() => onDeviceMode('desktop')}
            title="Desktop 1440×900"
          ><MonitorIcon /><span>Desktop</span></button>
          <button
            type="button"
            className={deviceMode === 'mobile' ? 'active' : ''}
            onClick={() => onDeviceMode('mobile')}
            title="Mobile 390×844"
          ><PhoneIcon /><span>Mobile</span></button>
        </div>

        <div className="mode-toggle" aria-label="表示モード">
          <button type="button" className={mode === 'live' ? 'active' : ''} onClick={() => onModeChange('live')}>操作</button>
          <button type="button" className={mode === 'preview' ? 'active' : ''} onClick={() => onModeChange('preview')}>完成</button>
        </div>
      </div>

      <div className="toolbar-actions" aria-label="撮影と書き出し">
        {showRefreshAction ? (
          <button
            className={`toolbar-context-action ${viewportChangedSinceCapture ? 'requires-recapture' : 'requires-recompose'}`}
            type="button"
            disabled={refreshDisabled}
            onClick={viewportChangedSinceCapture ? onCapture : onRecompose}
          >
            {viewportChangedSinceCapture ? <CameraIcon /> : <SparklesIcon />}
            <span>{refreshLabel}</span>
          </button>
        ) : null}

        <div className="toolbar-export-actions">
          <button
            className="toolbar-icon-action toolbar-copy-action"
            type="button"
            aria-label="画像をコピー"
            title="画像をコピー"
            disabled={!captureAvailable || busy}
            onClick={onCopy}
          ><CopyIcon /><span>コピー</span></button>
          <button
            className="toolbar-icon-action toolbar-save-action"
            type="button"
            aria-label="PNGを保存"
            title="PNGを保存"
            disabled={!captureAvailable || busy}
            onClick={onSave}
          ><SaveIcon /><span>保存</span></button>
        </div>

        <button
          className={`toolbar-icon-action toolbar-settings-action ${settingsOpen ? 'active' : ''}`}
          type="button"
          aria-label={settingsOpen ? '詳細設定を閉じる' : '詳細設定を開く'}
          aria-expanded={settingsOpen}
          aria-controls="settings-panel"
          title={settingsOpen ? '詳細設定を閉じる' : '詳細設定を開く'}
          onClick={onSettingsToggle}
        ><SlidersIcon /><span>設定</span></button>

        <button className="capture-button" type="button" disabled={busy || !navigation.url} onClick={onCapture}>
          <CameraIcon />
          <span>{busy ? '処理中…' : '撮影'}</span>
          <kbd>Ctrl/⌘↵</kbd>
        </button>
      </div>
    </header>
  );
}
