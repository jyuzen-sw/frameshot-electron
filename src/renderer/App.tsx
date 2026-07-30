import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DEFAULT_SETTINGS, cloneSettings } from '@shared/presets';
import type {
  AppCommand,
  AppMode,
  CapturePreset,
  CaptureResult,
  CaptureSettings,
  CustomPreset,
  DeviceMode,
  NavigationState,
  UserPreferences,
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

type BusyAction = 'navigate' | 'capture' | 'recompose' | 'save' | 'copy' | 'session' | null;
type Notice = { kind: 'success' | 'error' | 'info'; message: string } | null;

function restoreSettings(): CaptureSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return validateCaptureSettings(JSON.parse(raw));
  } catch (error) {
    console.warn('Could not restore settings:', error);
  }
  return cloneSettings(DEFAULT_SETTINGS);
}

function settingsFingerprint(settings: CaptureSettings): string {
  return JSON.stringify(settings);
}

function pageCaptureFingerprint(settings: CaptureSettings): string {
  return JSON.stringify({
    width: settings.viewportWidth,
    height: settings.viewportHeight,
    device: settings.deviceMode,
    scale: settings.captureScale,
    wait: settings.waitMs,
    hideScrollbars: settings.hideScrollbars,
    pauseAnimations: settings.pauseAnimations,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validCustomPresets(value: CustomPreset[]): CustomPreset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((preset) => {
    try {
      if (!preset || typeof preset.id !== 'string' || typeof preset.name !== 'string') return [];
      return [{ ...preset, settings: validateCaptureSettings(preset.settings) }];
    } catch {
      return [];
    }
  });
}

export function App(): React.JSX.Element {
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<CaptureSettings>(restoreSettings);
  const [urlInput, setUrlInput] = usePersistentState('frameshot:last-url', 'http://localhost:4321');
  const [storedCustomPresets, setStoredCustomPresets] = usePersistentState<CustomPreset[]>('frameshot:custom-presets', []);
  const customPresets = useMemo(() => validCustomPresets(storedCustomPresets), [storedCustomPresets]);
  const [navigation, setNavigation] = useState<NavigationState>(EMPTY_NAVIGATION);
  const [preferences, setPreferences] = useState<UserPreferences>(EMPTY_PREFERENCES);
  const [mode, setMode] = useState<AppMode>('live');
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [lastCompositeFingerprint, setLastCompositeFingerprint] = useState<string | null>(null);
  const [lastPageFingerprint, setLastPageFingerprint] = useState<string | null>(null);
  const [settingsPanelOpen, setSettingsPanelOpen] = usePersistentState(
    SETTINGS_PANEL_STORAGE_KEY,
    false,
  );

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
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
    const removeNavigationListener = window.frameShot.onNavigationState((state) => {
      setNavigation(state);
      if (state.url && document.activeElement !== urlInputRef.current) {
        setUrlInput(state.url);
      }
    });
    void window.frameShot.getPreferences().then(setPreferences).catch((error) => {
      setNotice({ kind: 'error', message: errorMessage(error) });
    });
    return removeNavigationListener;
  }, [setUrlInput]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), notice.kind === 'error' ? 7000 : 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const currentSettingsFingerprint = useMemo(() => settingsFingerprint(settings), [settings]);
  const currentPageFingerprint = useMemo(() => pageCaptureFingerprint(settings), [settings]);
  const needsRecompose = Boolean(capture && lastCompositeFingerprint !== currentSettingsFingerprint);
  const viewportChangedSinceCapture = Boolean(capture && lastPageFingerprint !== currentPageFingerprint);
  const currentHost = getHostname(navigation.url);
  const certificateAllowed = Boolean(
    currentHost && preferences.allowedCertificateHosts.includes(currentHost),
  );

  const showError = useCallback((error: unknown) => {
    setNotice({ kind: 'error', message: errorMessage(error) });
  }, []);

  const navigate = useCallback(async () => {
    if (!urlInput.trim() || busy) return;
    setBusy('navigate');
    setMode('live');
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

  const takeCapture = useCallback(async (): Promise<CaptureResult | null> => {
    if (!navigation.url || busy) return null;
    let validatedSettings: CaptureSettings;
    try {
      validatedSettings = validateCaptureSettings(settings);
    } catch (error) {
      showError(error);
      return null;
    }
    setBusy('capture');
    try {
      const result = await window.frameShot.capture(validatedSettings);
      setCapture(result);
      setLastCompositeFingerprint(settingsFingerprint(validatedSettings));
      setLastPageFingerprint(pageCaptureFingerprint(validatedSettings));
      setMode('preview');
      setNotice({ kind: 'success', message: `${result.width} × ${result.height} の画像を作成しました。` });
      return result;
    } catch (error) {
      showError(error);
      return null;
    } finally {
      setBusy(null);
    }
  }, [busy, navigation.url, settings, showError]);

  const recompose = useCallback(async () => {
    if (!capture || busy) return;
    let validatedSettings: CaptureSettings;
    try {
      validatedSettings = validateCaptureSettings(settings);
    } catch (error) {
      showError(error);
      return;
    }
    setBusy('recompose');
    try {
      const result = await window.frameShot.recompose(validatedSettings);
      setCapture(result);
      setLastCompositeFingerprint(settingsFingerprint(validatedSettings));
      setMode('preview');
      setNotice({ kind: 'success', message: '背景とフレームを再合成しました。' });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }, [busy, capture, settings, showError]);

  const saveCapture = useCallback(async () => {
    if (busy) return;
    if (!capture) {
      const created = await takeCapture();
      if (!created) return;
    }
    setBusy('save');
    try {
      const result = await window.frameShot.saveCapture();
      if (result.saved) {
        setNotice({ kind: 'success', message: `PNGを保存しました: ${result.path ?? ''}` });
      }
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }, [busy, capture, showError, takeCapture]);

  const copyCapture = useCallback(async () => {
    if (!capture || busy) return;
    setBusy('copy');
    try {
      await window.frameShot.copyCapture();
      setNotice({ kind: 'success', message: '画像をクリップボードへコピーしました。' });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }, [busy, capture, showError]);

  const changeDeviceMode = useCallback((deviceMode: DeviceMode) => {
    setSettings((current) => deviceMode === 'mobile'
      ? {
          ...current,
          deviceMode,
          viewportWidth: 390,
          viewportHeight: 844,
          frameStyle: current.frameStyle === 'browser' ? 'phone' : current.frameStyle,
          showUrl: false,
        }
      : {
          ...current,
          deviceMode,
          viewportWidth: 1440,
          viewportHeight: 900,
          frameStyle: current.frameStyle === 'phone' ? 'browser' : current.frameStyle,
          showUrl: current.frameStyle === 'phone' ? true : current.showUrl,
        });
  }, []);

  const applyPreset = useCallback((preset: CapturePreset | CustomPreset) => {
    setSettings(cloneSettings(preset.settings));
    setNotice({ kind: 'info', message: `${preset.name} を適用しました。` });
  }, []);

  const saveCustomPreset = useCallback((name: string) => {
    const preset: CustomPreset = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      settings: cloneSettings(settings),
    };
    setStoredCustomPresets((current) => [...validCustomPresets(current), preset]);
    setNotice({ kind: 'success', message: `プリセット「${name}」を保存しました。` });
  }, [setStoredCustomPresets, settings]);

  const deleteCustomPreset = useCallback((id: string) => {
    setStoredCustomPresets((current) => current.filter((preset) => preset.id !== id));
  }, [setStoredCustomPresets]);

  const setCertificateAllowed = useCallback(async (allowed: boolean) => {
    if (!currentHost || busy) return;
    setBusy('session');
    try {
      const next = await window.frameShot.setCertificateAllowed(currentHost, allowed);
      const nextAllowed = next.allowedCertificateHosts.includes(currentHost);
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
  }, [busy, certificateAllowed, currentHost, showError]);

  const resetSession = useCallback(async () => {
    if (busy || !window.confirm('対象ページのCookie、LocalStorage、キャッシュを削除します。続けますか？')) return;
    setBusy('session');
    try {
      await window.frameShot.resetSession();
      setNotice({ kind: 'success', message: '対象ページ用セッションを初期化しました。' });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  }, [busy, showError]);

  useEffect(() => {
    const handleCommand = (command: AppCommand) => {
      if (command === 'capture') void takeCapture();
      if (command === 'save') void saveCapture();
      if (command === 'focus-url') {
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      }
      if (command === 'reload-target') void window.frameShot.reload(false);
    };
    return window.frameShot.onAppCommand(handleCommand);
  }, [saveCapture, takeCapture]);

  useEffect(() => () => {
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
  }, []);

  return (
    <div className="app-shell">
      <Toolbar
        url={urlInput}
        urlInputRef={urlInputRef}
        navigation={navigation}
        mode={mode}
        deviceMode={settings.deviceMode}
        busy={Boolean(busy)}
        captureAvailable={Boolean(capture)}
        needsRecompose={needsRecompose}
        viewportChangedSinceCapture={viewportChangedSinceCapture}
        settingsOpen={settingsPanelOpen}
        onUrlChange={setUrlInput}
        onNavigate={() => void navigate()}
        onBack={() => void window.frameShot.goBack()}
        onForward={() => void window.frameShot.goForward()}
        onReload={() => void window.frameShot.reload(false)}
        onDeviceMode={changeDeviceMode}
        onCapture={() => void takeCapture()}
        onRecompose={() => void recompose()}
        onCopy={() => void copyCapture()}
        onSave={() => void saveCapture()}
        onSettingsToggle={() => setSettingsPanelOpen((current) => !current)}
        onModeChange={setMode}
      />

      <main
        className={`workspace ${settingsPanelOpen ? 'settings-open' : 'settings-closed'}`}
      >
        <div className="studio-column">
          {navigation.error && (
            <div className="page-error-banner">
              <AlertIcon />
              <div><b>ページを表示できませんでした</b><span>{navigation.error}</span></div>
              <button type="button" onClick={() => void window.frameShot.reload(true)}>キャッシュ無視で再試行</button>
            </div>
          )}

          <LiveCanvas
            mode={mode}
            settings={settings}
            capture={capture}
            pageUrl={navigation.url}
            pageLoading={navigation.isLoading}
            needsRecompose={needsRecompose || viewportChangedSinceCapture}
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
            customPresets={customPresets}
            currentHost={currentHost}
            certificateAllowed={certificateAllowed}
            captureAvailable={Boolean(capture)}
            needsRecompose={needsRecompose}
            viewportChangedSinceCapture={viewportChangedSinceCapture}
            busy={Boolean(busy)}
            onSettingsChange={setSettings}
            onApplyPreset={applyPreset}
            onSaveCustomPreset={saveCustomPreset}
            onDeleteCustomPreset={deleteCustomPreset}
            onCertificateAllowed={(allowed) => void setCertificateAllowed(allowed)}
            onResetSession={() => void resetSession()}
            onOpenDevTools={() => void window.frameShot.openTargetDevTools()}
            onRecompose={() => void recompose()}
            onCapture={() => void takeCapture()}
            onClose={() => setSettingsPanelOpen(false)}
          />
        </div>
      </main>

      {busy && (
        <div className="busy-indicator" role="status">
          <span />
          {busy === 'capture' ? 'ページを撮影して合成しています…' :
            busy === 'recompose' ? '背景とフレームを再合成しています…' :
              busy === 'navigate' ? 'ページを開いています…' : '処理しています…'}
        </div>
      )}

      {notice && (
        <div className={`toast-notice ${notice.kind}`} role="status">
          {notice.kind === 'success' ? <CheckIcon /> : notice.kind === 'error' ? <AlertIcon /> : <SparklesIcon />}
          <span>{notice.message}</span>
          <button type="button" aria-label="閉じる" onClick={() => setNotice(null)}><XIcon /></button>
        </div>
      )}
    </div>
  );
}
