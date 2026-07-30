import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import {
  findViewportPreset,
  viewportPresetsFor,
} from '@shared/presets';
import type {
  CaptureSettings,
  DeviceMode,
  NavigationState,
  ViewportPreset,
} from '@shared/types';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  ChevronDownIcon,
  CopyIcon,
  MonitorIcon,
  PhoneIcon,
  ReloadIcon,
  SaveIcon,
  SlidersIcon,
} from './Icons';

interface ToolbarProps {
  url: string;
  urlInputRef: RefObject<HTMLInputElement | null>;
  navigation: NavigationState;
  settings: CaptureSettings;
  busy: boolean;
  settingsOpen: boolean;
  onUrlChange: (value: string) => void;
  onNavigate: () => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onViewportPreset: (preset: ViewportPreset) => void;
  onCustomViewport: (deviceMode: DeviceMode) => void;
  onCopy: () => void;
  onSave: () => void;
  onSettingsToggle: () => void;
}

function moveMenuFocus(
  event: KeyboardEvent<HTMLDivElement>,
): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]',
    ),
  );
  if (items.length === 0) return;
  event.preventDefault();
  const currentIndex = items.indexOf(
    document.activeElement as HTMLButtonElement,
  );
  const delta = event.key === 'ArrowDown' ? 1 : -1;
  const nextIndex =
    currentIndex < 0
      ? delta > 0
        ? 0
        : items.length - 1
      : (currentIndex + delta + items.length) % items.length;
  items[nextIndex]?.focus();
}

export function Toolbar({
  url,
  urlInputRef,
  navigation,
  settings,
  busy,
  settingsOpen,
  onUrlChange,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onViewportPreset,
  onCustomViewport,
  onCopy,
  onSave,
  onSettingsToggle,
}: ToolbarProps): React.JSX.Element {
  const [openMenu, setOpenMenu] = useState<DeviceMode | null>(null);
  const viewportMenusRef = useRef<HTMLDivElement>(null);
  const exactPreset = findViewportPreset(settings);

  useEffect(() => {
    if (!openMenu) return;
    const closeOnPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !viewportMenusRef.current?.contains(event.target)
      ) {
        setOpenMenu(null);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('pointerdown', closeOnPointer);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  const renderViewportMenu = (
    deviceMode: DeviceMode,
  ): React.JSX.Element => {
    const active = settings.deviceMode === deviceMode;
    const label = deviceMode === 'desktop' ? 'Desktop' : 'Mobile';
    const Icon = deviceMode === 'desktop' ? MonitorIcon : PhoneIcon;
    const expanded = openMenu === deviceMode;
    return (
      <div
        className={`viewport-menu ${active ? 'active' : ''}`}
        data-device-mode={deviceMode}
      >
        <button
          type="button"
          className="viewport-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={expanded}
          onClick={() =>
            setOpenMenu((current) =>
              current === deviceMode ? null : deviceMode,
            )
          }
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpenMenu(deviceMode);
              requestAnimationFrame(() => {
                viewportMenusRef.current
                  ?.querySelector<HTMLButtonElement>(
                    `[data-device-mode="${deviceMode}"] [role="menu"] button`,
                  )
                  ?.focus();
              });
            }
          }}
        >
          <Icon />
          <span>
            <b>{label}</b>
            {active && (
              <small>
                {exactPreset?.name ?? 'Custom'} · {settings.viewportWidth}×
                {settings.viewportHeight}
              </small>
            )}
          </span>
          <ChevronDownIcon />
        </button>
        {expanded && (
          <div
            className="viewport-menu-list"
            role="menu"
            aria-label={`${label} viewport`}
            onKeyDown={moveMenuFocus}
          >
            {viewportPresetsFor(deviceMode).map((preset) => {
              const selected = exactPreset?.id === preset.id;
              return (
                <button
                  type="button"
                  role="menuitem"
                  key={preset.id}
                  className={selected ? 'selected' : ''}
                  onClick={() => {
                    onViewportPreset(preset);
                    setOpenMenu(null);
                  }}
                >
                  <span><b>{preset.name}</b><small>{preset.width} × {preset.height}</small></span>
                  {selected && <i aria-label="選択中">✓</i>}
                </button>
              );
            })}
            <button
              type="button"
              role="menuitem"
              className={active && !exactPreset ? 'selected custom' : 'custom'}
              onClick={() => {
                onCustomViewport(deviceMode);
                setOpenMenu(null);
              }}
            >
              <span><b>Custom…</b><small>幅と高さを入力</small></span>
              {active && !exactPreset && <i aria-label="選択中">✓</i>}
            </button>
          </div>
        )}
      </div>
    );
  };

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

      <div
        className="toolbar-view-group"
        ref={viewportMenusRef}
        aria-label="viewportプリセット"
      >
        {renderViewportMenu('desktop')}
        {renderViewportMenu('mobile')}
      </div>

      <div className="toolbar-actions" aria-label="書き出しと設定">
        <div className="toolbar-export-actions">
          <button
            className="toolbar-icon-action toolbar-copy-action"
            type="button"
            aria-label="画像をコピー"
            title="画像をコピー"
            disabled={!navigation.url || busy}
            onClick={onCopy}
          ><CopyIcon /><span>コピー</span></button>
          <button
            className="toolbar-icon-action toolbar-save-action"
            type="button"
            aria-label="PNGを保存"
            title="PNGを保存"
            disabled={!navigation.url || busy}
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
      </div>
    </header>
  );
}
