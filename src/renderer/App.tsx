import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_SETTINGS,
  applyViewportPreset,
  cloneSettings,
} from '@shared/presets';
import type {
  CaptureSettings,
  DeviceMode,
  ExportDestination,
  NavigationState,
  UserPreferences,
  ViewportPreset,
} from '@shared/types';
import { getHostname } from '@shared/url';
import { validateCaptureSettings } from '@shared/validation';
import { LiveCanvas } from './components/LiveCanvas';
import { SettingsPanel } from './components/SettingsPanel';
import { Toolbar } from './components/Toolbar';
import {
  AlertIcon,
  CheckIcon,
  SparklesIcon,
  XIcon,
} from './components/Icons';
import { usePersistentState } from './hooks/usePersistentState';

const SETTINGS_STORAGE_KEY = 'frameshot:settings:v2';
const SETTINGS_PANEL_STORAGE_KEY = 'frameshot:settings-panel-open';

const EMPTY_NAVIGATION: NavigationState = {
  url: '',
  title: '',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
};

const EMPTY_PREFERENCES: UserPreferences = {
  allowedCertificateHosts: [],
};

type BusyAction = 'navigate' | 'export' | 'session' | null;
type Notice = {
  kind: 'success' | 'error' | 'info';
  message: string;
} | null;

function restoreSettings(): CaptureSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return validateCaptureSettings(JSON.parse(raw));
  } catch (error) {
    console.warn('Could not restore settings:', error);
  }
  return cloneSettings(DEFAULT_SETTINGS);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App(): React.JSX.Element {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<CaptureSettings>(restoreSettings);
  const [urlInput, setUrlInput] = usePersistentState(
    'frameshot:last-url',
    'http://localhost:4321',
  );
  const [navigation, setNavigation] =
    useState<NavigationState>(EMPTY_NAVIGATION);
  const [preferences, setPreferences] =
    useState<UserPreferences>(EMPTY_PREFERENCES);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [settingsPanelOpen, setSettingsPanelOpen] = usePersistentState(
    SETTINGS_PANEL_STORAGE_KEY,
    false,
  );
  const [focusViewportRequest, setFocusViewportRequest] = useState(0);

  useEffect(() => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  }, [settings]);

  useEffect(() => {
    if (!settingsPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsPanelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [setSettingsPanelOpen, settingsPanelOpen]);

  useEffect(() => {
    const removeNavigationListener = window.frameShot.onNavigationState(
      (state) => {
        setNavigation(state);
        if (state.url && document.activeElement !== urlInputRef.current) {
          setUrlInput(state.url);
        }
      },
    );
    void window.frameShot
      .getPreferences()
      .then(setPreferences)
      .catch((error) => {
        setNotice({ kind: 'error', message: errorMessage(error) });
      });
    return removeNavigationListener;
  }, [setUrlInput]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(
      () => setNotice(null),
      notice.kind === 'error' ? 7000 : 3600,
    );
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const currentHost = getHostname(navigation.url);
  const certificateAllowed = Boolean(
    currentHost &&
      preferences.allowedCertificateHosts.includes(currentHost),
  );

  const showError = useCallback((error: unknown) => {
    setNotice({ kind: 'error', message: errorMessage(error) });
  }, []);

  const navigate = useCallback(async () => {
    if (!urlInput.trim() || busy) return;
    setBusy('navigate');
    try {
      const state = await window.frameShot.navigate(urlInput);
      setNavigation(state);
      setUrlInput(state.url);
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }, [busy, setUrlInput, showError, urlInput]);

  const exportImage = useCallback(
    async (destination: ExportDestination) => {
      if (!navigation.url || busy) return;
      let validatedSettings: CaptureSettings;
      try {
        validatedSettings = validateCaptureSettings(settings);
      } catch (error) {
        showError(error);
        return;
      }
      setBusy('export');
      try {
        const result = await window.frameShot.exportImage(
          validatedSettings,
          destination,
        );
        if (!result.completed) return;
        setNotice({
          kind: 'success',
          message:
            destination === 'clipboard'
              ? `${result.width} × ${result.height} の画像をコピーしました。`
              : `PNGを保存しました: ${result.path ?? ''}`,
        });
      } catch (error) {
        showError(error);
      } finally {
        setBusy(null);
      }
    },
    [busy, navigation.url, settings, showError],
  );

  const selectViewportPreset = useCallback(
    (preset: ViewportPreset) => {
      setSettings((current) => applyViewportPreset(current, preset));
      setNotice({
        kind: 'info',
        message: `${preset.name} ${preset.width} × ${preset.height} を適用しました。`,
      });
    },
    [],
  );

  const openCustomViewport = useCallback(
    (deviceMode: DeviceMode) => {
      setSettings((current) => ({ ...current, deviceMode }));
      setSettingsPanelOpen(true);
      setFocusViewportRequest((current) => current + 1);
    },
    [setSettingsPanelOpen],
  );

  const setCertificateAllowed = useCallback(
    async (allowed: boolean) => {
      if (!currentHost || busy) return;
      setBusy('session');
      try {
        const next = await window.frameShot.setCertificateAllowed(
          currentHost,
          allowed,
        );
        const nextAllowed =
          next.allowedCertificateHosts.includes(currentHost);
        setPreferences(next);
        setNotice({
          kind: 'info',
          message:
            nextAllowed === certificateAllowed
              ? '証明書例外の変更をキャンセルしました。'
              : nextAllowed
                ? `${currentHost} の証明書エラーを許可し、対象セッションを再作成しました。`
                : `${currentHost} の証明書例外を解除し、対象セッションを再作成しました。`,
        });
      } catch (error) {
        showError(error);
      } finally {
        setBusy(null);
      }
    },
    [busy, certificateAllowed, currentHost, showError],
  );

  const resetSession = useCallback(async () => {
    if (
      busy ||
      !window.confirm(
        '対象ページのCookie、LocalStorage、キャッシュを削除します。続けますか？',
      )
    ) {
      return;
    }
    setBusy('session');
    try {
      await window.frameShot.resetSession();
      setNotice({
        kind: 'success',
        message: '対象ページ用セッションを初期化しました。',
      });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }, [busy, showError]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        void exportImage('file');
      }
      if (key === 'l') {
        event.preventDefault();
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      }
      if (key === 'r') {
        event.preventDefault();
        if (navigation.url && !busy) {
          void window.frameShot.reload(false);
        }
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [busy, exportImage, navigation.url]);

  useEffect(
    () => () => {
      window.frameShot.setTargetLayout({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        borderRadius: 0,
        visible: false,
        viewport: {
          width: DEFAULT_SETTINGS.viewportWidth,
          height: DEFAULT_SETTINGS.viewportHeight,
          mode: DEFAULT_SETTINGS.deviceMode,
        },
      });
    },
    [],
  );

  return (
    <div className="app-shell">
      <Toolbar
        url={urlInput}
        urlInputRef={urlInputRef}
        navigation={navigation}
        settings={settings}
        busy={Boolean(busy)}
        settingsOpen={settingsPanelOpen}
        onUrlChange={setUrlInput}
        onNavigate={() => void navigate()}
        onBack={() => void window.frameShot.goBack()}
        onForward={() => void window.frameShot.goForward()}
        onReload={() => void window.frameShot.reload(false)}
        onViewportPreset={selectViewportPreset}
        onCustomViewport={openCustomViewport}
        onCopy={() => void exportImage('clipboard')}
        onSave={() => void exportImage('file')}
        onSettingsToggle={() =>
          setSettingsPanelOpen((current) => !current)
        }
      />

      <main
        className={`workspace ${
          settingsPanelOpen ? 'settings-open' : 'settings-closed'
        }`}
      >
        <div className="studio-column">
          {navigation.error && (
            <div className="page-error-banner">
              <AlertIcon />
              <div>
                <b>ページを表示できませんでした</b>
                <span>{navigation.error}</span>
              </div>
              <button
                type="button"
                onClick={() => void window.frameShot.reload(true)}
              >
                キャッシュ無視で再試行
              </button>
            </div>
          )}

          <LiveCanvas
            settings={settings}
            pageUrl={navigation.url}
            pageLoading={navigation.isLoading}
            onTargetLayout={window.frameShot.setTargetLayout}
          />
        </div>

        <div
          className="settings-panel-slot"
          aria-hidden={!settingsPanelOpen}
          inert={!settingsPanelOpen}
        >
          <SettingsPanel
            settings={settings}
            currentHost={currentHost}
            certificateAllowed={certificateAllowed}
            focusViewportRequest={focusViewportRequest}
            onSettingsChange={setSettings}
            onCertificateAllowed={(allowed) =>
              void setCertificateAllowed(allowed)
            }
            onResetSession={() => void resetSession()}
            onOpenDevTools={() =>
              void window.frameShot.openTargetDevTools()
            }
            onClose={() => setSettingsPanelOpen(false)}
          />
        </div>
      </main>

      {busy && (
        <div className="busy-indicator" role="status">
          <span />
          {busy === 'export'
            ? '最新のページから画像を書き出しています…'
            : busy === 'navigate'
              ? 'ページを開いています…'
              : '処理しています…'}
        </div>
      )}

      {notice && (
        <div className={`toast-notice ${notice.kind}`} role="status">
          {notice.kind === 'success' ? (
            <CheckIcon />
          ) : notice.kind === 'error' ? (
            <AlertIcon />
          ) : (
            <SparklesIcon />
          )}
          <span>{notice.message}</span>
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => setNotice(null)}
          >
            <XIcon />
          </button>
        </div>
      )}
    </div>
  );
}
