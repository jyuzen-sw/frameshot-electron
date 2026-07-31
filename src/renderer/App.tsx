import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_SETTINGS,
  applyCustomViewportMode,
  applyViewportPreset,
  cloneSettings,
  migrateV2Settings,
  migrateV3Settings,
} from '@shared/presets';
import type {
  AppShortcut,
  CaptureSettings,
  DeviceMode,
  ExportDestination,
  NavigationState,
  UserPreferences,
  ViewportPreset,
} from '@shared/types';
import { getHostname } from '@shared/url';
import { validateCaptureSettings } from '@shared/validation';
import { AppHeader } from './components/AppHeader';
import type { HeaderBusyAction } from './components/HeaderFeedback';
import { LiveCanvas } from './components/LiveCanvas';
import type { TargetSuspensionReason } from './components/CompositionCanvas';
import { SettingsPanel } from './components/SettingsPanel';
import { usePersistentState } from './hooks/usePersistentState';
import { useTransientNotice } from './hooks/useTransientNotice';
import './App.css';

const SETTINGS_STORAGE_KEY = 'frameshot:settings:v4';
const V3_SETTINGS_STORAGE_KEY = 'frameshot:settings:v3';
const V2_SETTINGS_STORAGE_KEY = 'frameshot:settings:v2';

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

export type FloatingUiState =
  | { kind: 'settings' }
  | { kind: 'viewport-menu'; deviceMode: DeviceMode }
  | null;

export function dismissViewportMenuState(
  current: FloatingUiState,
  deviceMode: DeviceMode,
): FloatingUiState {
  return current?.kind === 'viewport-menu' &&
    current.deviceMode === deviceMode
    ? null
    : current;
}

function readStoredSettings(key: string): CaptureSettings | null {
  const raw = window.localStorage.getItem(key);
  return raw ? validateCaptureSettings(JSON.parse(raw)) : null;
}

export function restoreSettings(): CaptureSettings {
  try {
    const current = readStoredSettings(SETTINGS_STORAGE_KEY);
    if (current) return current;
  } catch (error) {
    console.warn('Could not restore current settings:', error);
  }
  try {
    const v3 = readStoredSettings(V3_SETTINGS_STORAGE_KEY);
    if (v3) return migrateV3Settings(v3);
  } catch (error) {
    console.warn('Could not migrate v3 settings:', error);
  }
  try {
    const v2 = readStoredSettings(V2_SETTINGS_STORAGE_KEY);
    if (v2) return migrateV2Settings(v2);
  } catch (error) {
    console.warn('Could not migrate v2 settings:', error);
  }
  return cloneSettings(DEFAULT_SETTINGS);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App(): React.JSX.Element {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<CaptureSettings>(restoreSettings);
  const [urlInput, setUrlInput] = usePersistentState(
    'frameshot:last-url',
    'http://localhost:4321',
  );
  const [navigation, setNavigation] =
    useState<NavigationState>(EMPTY_NAVIGATION);
  const [preferences, setPreferences] =
    useState<UserPreferences>(EMPTY_PREFERENCES);
  const [busy, setBusy] = useState<HeaderBusyAction>(null);
  const { notice, showNotice, dismissNotice } = useTransientNotice({
    paused: busy !== null,
  });
  const [floatingUi, setFloatingUi] = useState<FloatingUiState>(null);
  const [focusViewportRequest, setFocusViewportRequest] = useState(0);
  const settingsPanelOpen = floatingUi?.kind === 'settings';
  const activeViewportMenu =
    floatingUi?.kind === 'viewport-menu'
      ? floatingUi.deviceMode
      : null;
  const targetSuspensionReason: TargetSuspensionReason | null =
    floatingUi?.kind === 'settings'
      ? 'settings'
      : floatingUi?.kind === 'viewport-menu'
        ? 'viewport-menu'
        : null;

  const closeSettingsPanel = useCallback((restoreFocus = false) => {
    setFloatingUi((current) =>
      current?.kind === 'settings' ? null : current,
    );
    if (restoreFocus) {
      window.requestAnimationFrame(() => settingsButtonRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  }, [settings]);

  useEffect(() => {
    if (!settingsPanelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSettingsPanel(true);
    };
    const closeOnPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (settingsPanelRef.current?.contains(event.target)) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[data-settings-trigger="true"]')
      ) {
        return;
      }
      closeSettingsPanel();
    };
    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOnPointer);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOnPointer);
    };
  }, [closeSettingsPanel, settingsPanelOpen]);

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
        showNotice({ kind: 'error', message: errorMessage(error) });
      });
    return removeNavigationListener;
  }, [setUrlInput, showNotice]);

  const currentHost = getHostname(navigation.url);
  const certificateAllowed = Boolean(
    currentHost &&
      preferences.allowedCertificateHosts.includes(currentHost),
  );

  const showError = useCallback((error: unknown) => {
    showNotice({ kind: 'error', message: errorMessage(error) });
  }, [showNotice]);

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
        showNotice({
          kind: 'success',
          message:
            destination === 'clipboard'
              ? `${result.width} × ${result.height} の画像をコピーしました。`
              : `${result.width} × ${result.height} のPNGを保存しました: ${result.path ?? ''}`,
        });
      } catch (error) {
        showError(error);
      } finally {
        setBusy(null);
      }
    },
    [busy, navigation.url, settings, showError, showNotice],
  );

  const selectViewportPreset = useCallback(
    (preset: ViewportPreset) => {
      setSettings((current) => applyViewportPreset(current, preset));
      showNotice({
        kind: 'info',
        message: `${preset.name} ${preset.width} × ${preset.height} を適用しました。`,
      });
    },
    [showNotice],
  );

  const openCustomViewport = useCallback(
    (deviceMode: DeviceMode) => {
      setSettings((current) =>
        applyCustomViewportMode(current, deviceMode),
      );
      setFloatingUi({ kind: 'settings' });
      setFocusViewportRequest((current) => current + 1);
    },
    [],
  );

  const openViewportMenu = useCallback((deviceMode: DeviceMode) => {
    setFloatingUi({ kind: 'viewport-menu', deviceMode });
  }, []);

  const dismissViewportMenu = useCallback((deviceMode: DeviceMode) => {
    setFloatingUi((current) =>
      dismissViewportMenuState(current, deviceMode),
    );
  }, []);

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
        showNotice({
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
    [busy, certificateAllowed, currentHost, showError, showNotice],
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
      showNotice({
        kind: 'success',
        message: '対象ページ用セッションを初期化しました。',
      });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }, [busy, showError, showNotice]);

  const runAppShortcut = useCallback(
    (shortcut: AppShortcut) => {
      if (shortcut === 'save') {
        void exportImage('file');
      }
      if (shortcut === 'focus-url') {
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      }
      if (shortcut === 'reload-target' && navigation.url && !busy) {
        void window.frameShot.reload(false);
      }
    },
    [busy, exportImage, navigation.url],
  );

  useEffect(
    () => window.frameShot.onAppShortcut(runAppShortcut),
    [runAppShortcut],
  );

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        (!event.ctrlKey && !event.metaKey) ||
        event.altKey ||
        event.repeat
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      const shortcut: AppShortcut | null =
        key === 's'
          ? 'save'
          : key === 'l'
            ? 'focus-url'
            : key === 'r'
              ? 'reload-target'
              : null;
      if (!shortcut) return;
      event.preventDefault();
      runAppShortcut(shortcut);
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [runAppShortcut]);

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
      <AppHeader
        url={urlInput}
        urlInputRef={urlInputRef}
        settingsButtonRef={settingsButtonRef}
        navigation={navigation}
        settings={settings}
        busy={busy}
        notice={notice}
        settingsOpen={settingsPanelOpen}
        openViewportMenu={activeViewportMenu}
        onUrlChange={setUrlInput}
        onNavigate={() => void navigate()}
        onBack={() => void window.frameShot.goBack()}
        onForward={() => void window.frameShot.goForward()}
        onReload={() => void window.frameShot.reload(false)}
        onNavigationRetry={() => void window.frameShot.reload(true)}
        onNoticeDismiss={dismissNotice}
        onViewportPreset={selectViewportPreset}
        onCustomViewport={openCustomViewport}
        onViewportMenuOpen={openViewportMenu}
        onViewportMenuDismiss={dismissViewportMenu}
        onCopy={() => void exportImage('clipboard')}
        onSave={() => void exportImage('file')}
        onSettingsToggle={() =>
          setFloatingUi((current) =>
            current?.kind === 'settings' ? null : { kind: 'settings' },
          )
        }
      />

      <main
        className={`workspace ${
          settingsPanelOpen ? 'settings-open' : 'settings-closed'
        }`}
      >
        <div className="studio-column">
          <LiveCanvas
            settings={settings}
            pageUrl={navigation.url}
            pageLoading={navigation.isLoading}
            targetSuspensionReason={targetSuspensionReason}
            onTargetLayout={window.frameShot.setTargetLayout}
          />
        </div>

        <div
          ref={settingsPanelRef}
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
            onClose={() => closeSettingsPanel(true)}
          />
        </div>
      </main>
    </div>
  );
}
