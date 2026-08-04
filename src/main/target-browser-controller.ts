import { randomUUID } from 'node:crypto';
import {
  BaseWindow,
  BrowserWindow,
  dialog,
  type NativeImage,
  session,
  type Session,
  type WebContents,
  WebContentsView,
} from 'electron';
import type {
  AppShortcut,
  CaptureSettings,
  NavigationState,
  TargetViewLayout,
  UserPreferences,
} from '@shared/types';
import { getHostname, isSupportedTargetUrl, normalizeTargetUrl } from '@shared/url';
import { dispatchAppShortcutInput } from './app-shortcuts';
import {
  captureExactPage,
  captureWithRestoration,
} from './exact-page-capture';
import type { PreferencesStore } from './preferences-store';
import { configureTargetSession, TARGET_PARTITION } from './security';
import {
  CANCEL_BUTTON_ID,
  CONFIRM_BUTTON_ID,
  createBlockedPopupWarning,
  createCertificateExceptionWarning,
  createCertificateRemovalWarning,
  createTargetPopupWarning,
  isAllowedTargetWindowUrl,
} from './target-window-policy';

const EMPTY_STATE: NavigationState = {
  url: '',
  title: '',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function captureCss(settings: CaptureSettings): string {
  const rules = [
    'html { caret-color: transparent !important; }',
    'input, textarea, [contenteditable="true"] { caret-color: transparent !important; }',
  ];

  if (settings.hideScrollbars) {
    rules.push(
      'html { scrollbar-width: none !important; }',
      'body { scrollbar-width: none !important; }',
      '::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }',
    );
  }

  if (settings.pauseAnimations) {
    rules.push(
      '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }',
    );
  }

  return rules.join('\n');
}

export class TargetBrowserController {
  private view!: WebContentsView;
  private targetSession!: Session;
  private readonly onState: (state: NavigationState) => void;
  private readonly onShortcut: (shortcut: AppShortcut) => void;
  private readonly preferences: PreferencesStore;
  private readonly popupWindows = new Set<BrowserWindow>();
  private state: NavigationState = { ...EMPTY_STATE };
  private currentLayout: TargetViewLayout | null = null;
  private reconfiguring = false;
  private disposed = false;
  private viewOwner: BaseWindow | null = null;
  private captureHost: BaseWindow | null = null;
  private captureInProgress = false;

  public constructor(
    private readonly mainWindow: BrowserWindow,
    preferences: PreferencesStore,
    onState: (state: NavigationState) => void,
    onShortcut: (shortcut: AppShortcut) => void,
  ) {
    this.preferences = preferences;
    this.onState = onState;
    this.onShortcut = onShortcut;
    this.createTargetEnvironment();
  }

  public get currentUrl(): string {
    return this.view.webContents.getURL() || this.state.url;
  }

  public get navigationState(): NavigationState {
    return { ...this.state };
  }

  public navigate(input: string): NavigationState {
    this.assertEnvironmentAvailable();
    const targetUrl = normalizeTargetUrl(input);
    const webContents = this.view.webContents;
    if (webContents.isLoading()) {
      webContents.stop();
    }
    this.state = {
      ...this.state,
      url: targetUrl,
      title: '',
      isLoading: true,
      error: undefined,
    };
    this.emitState();

    // did-fail-load owns visible errors because this rejection also represents
    // intentional cancellation when a newer URL replaces the current request.
    void webContents.loadURL(targetUrl).catch(() => undefined);
    return this.navigationState;
  }

  public goBack(): void {
    if (this.disposed || this.reconfiguring || this.captureInProgress) return;
    const history = this.view.webContents.navigationHistory;
    if (history.canGoBack()) {
      history.goBack();
    }
  }

  public goForward(): void {
    if (this.disposed || this.reconfiguring || this.captureInProgress) return;
    const history = this.view.webContents.navigationHistory;
    if (history.canGoForward()) {
      history.goForward();
    }
  }

  public reload(ignoreCache = false): void {
    if (
      this.disposed ||
      this.reconfiguring ||
      this.captureInProgress ||
      !this.currentUrl
    ) return;
    if (ignoreCache) {
      this.view.webContents.reloadIgnoringCache();
    } else {
      this.view.webContents.reload();
    }
  }

  public stopNavigation(): void {
    if (this.disposed || this.reconfiguring || this.captureInProgress) return;
    const webContents = this.view.webContents;
    if (!webContents.isLoading()) return;

    webContents.stop();
    this.refreshState(false, false);
  }

  public setLayout(layout: TargetViewLayout): void {
    this.currentLayout = { ...layout, viewport: { ...layout.viewport } };
    if (this.disposed || this.reconfiguring || this.captureInProgress) return;
    this.applyInteractiveLayout(this.currentLayout);
  }

  public async captureViewport(settings: CaptureSettings): Promise<NativeImage> {
    this.assertEnvironmentAvailable();
    if (!this.currentUrl || !isSupportedTargetUrl(this.currentUrl)) {
      throw new Error('撮影するページを先に開いてください。');
    }

    const savedLayout = this.currentLayout
      ? { ...this.currentLayout, viewport: { ...this.currentLayout.viewport } }
      : null;
    const webContents = this.view.webContents;
    const wasBackgroundThrottling = webContents.getBackgroundThrottling();
    let insertedCssKey: string | null = null;
    this.captureInProgress = true;

    return captureWithRestoration({
      capture: async () => {
        this.view.setVisible(false);
        this.view.setBorderRadius(0);
        webContents.setBackgroundThrottling(false);

        const physicalWidth = Math.round(
          settings.viewportWidth * settings.captureScale,
        );
        const physicalHeight = Math.round(
          settings.viewportHeight * settings.captureScale,
        );
        const captureHost = new BaseWindow({
          width: physicalWidth,
          height: physicalHeight,
          show: false,
          useContentSize: true,
          frame: false,
          focusable: false,
          enableLargerThanScreen: true,
          backgroundColor: '#000000',
        });
        this.captureHost = captureHost;
        this.moveTargetViewTo(captureHost);
        this.view.setBounds({
          x: 0,
          y: 0,
          width: physicalWidth,
          height: physicalHeight,
        });
        webContents.enableDeviceEmulation({
          screenPosition:
            settings.deviceMode === 'mobile' ? 'mobile' : 'desktop',
          screenSize: {
            width: settings.viewportWidth,
            height: settings.viewportHeight,
          },
          viewPosition: { x: 0, y: 0 },
          deviceScaleFactor: 1,
          viewSize: {
            width: settings.viewportWidth,
            height: settings.viewportHeight,
          },
          scale: settings.captureScale,
        });

        insertedCssKey = await webContents.insertCSS(captureCss(settings), {
          cssOrigin: 'user',
        });
        this.view.setVisible(true);

        return captureExactPage(
          {
            prepareAttempt: async () => {
              await webContents.executeJavaScript(`
                (async () => {
                  if (document.fonts && document.fonts.ready) {
                    await Promise.race([
                      document.fonts.ready,
                      new Promise((resolve) => setTimeout(resolve, 3000))
                    ]);
                  }
                  await Promise.race([
                    new Promise((resolve) =>
                      requestAnimationFrame(() => requestAnimationFrame(resolve))
                    ),
                    new Promise((resolve) => setTimeout(resolve, 250))
                  ]);
                })();
              `);
              await delay(Math.max(50, settings.waitMs));
            },
            invalidate: () => webContents.invalidate(),
            capturePage: (rectangle, options) =>
              webContents.capturePage(rectangle, options),
          },
          {
            width: physicalWidth,
            height: physicalHeight,
          },
        );
      },
      restore: async () => {
        try {
          if (!webContents.isDestroyed()) {
            this.view.setVisible(false);
          }
          this.destroyCaptureHost();
          if (insertedCssKey && !webContents.isDestroyed()) {
            await webContents
              .removeInsertedCSS(insertedCssKey)
              .catch(() => undefined);
          }
          if (!webContents.isDestroyed()) {
            webContents.setBackgroundThrottling(wasBackgroundThrottling);
          }
          if (
            !this.disposed &&
            !this.reconfiguring &&
            !this.mainWindow.isDestroyed() &&
            !webContents.isDestroyed()
          ) {
            this.moveTargetViewTo(this.mainWindow);
            const restoreLayout = this.currentLayout ?? savedLayout;
            if (restoreLayout) {
              this.applyInteractiveLayout(restoreLayout);
            } else {
              this.view.setVisible(false);
            }
          }
        } finally {
          this.captureInProgress = false;
        }
      },
    });
  }

  public async resetSession(): Promise<void> {
    this.assertEnvironmentAvailable();
    this.closePopupWindows();
    await Promise.all([
      this.targetSession.clearStorageData(),
      this.targetSession.clearCache(),
      this.targetSession.clearAuthCache(),
      this.targetSession.closeAllConnections(),
    ]);
    this.view.webContents.navigationHistory.clear();
    if (this.currentUrl) {
      this.reload(true);
    }
  }

  public async setCertificateAllowed(
    host: string,
    allowed: boolean,
  ): Promise<UserPreferences> {
    this.assertEnvironmentAvailable();
    this.reconfiguring = true;

    try {
      const normalizedHost = host.trim().toLowerCase();
      const currentHost = getHostname(this.currentUrl);
      if (!currentHost || normalizedHost !== currentHost) {
        throw new Error('現在表示中のホストだけ証明書例外を変更できます。');
      }

      if (
        this.preferences.isCertificateHostAllowed(normalizedHost) === allowed
      ) {
        return this.preferences.get();
      }

      if (allowed) {
        const warning = createCertificateExceptionWarning(normalizedHost);
        const response = dialog.showMessageBoxSync(this.mainWindow, {
          type: 'warning',
          title: '証明書エラーの例外',
          message: warning.message,
          detail: warning.detail,
          buttons: ['キャンセル', 'すべての証明書エラーを許可'],
          defaultId: CANCEL_BUTTON_ID,
          cancelId: CANCEL_BUTTON_ID,
          noLink: true,
        });
        if (response !== CONFIRM_BUTTON_ID) {
          return this.preferences.get();
        }
      } else {
        const warning = createCertificateRemovalWarning(normalizedHost);
        const response = dialog.showMessageBoxSync(this.mainWindow, {
          type: 'warning',
          title: '証明書例外の解除',
          message: warning.message,
          detail: warning.detail,
          buttons: ['キャンセル', '解除してセッションを再作成'],
          defaultId: CANCEL_BUTTON_ID,
          cancelId: CANCEL_BUTTON_ID,
          noLink: true,
        });
        if (response !== CONFIRM_BUTTON_ID) {
          return this.preferences.get();
        }
      }

      const next = await this.preferences.setCertificateHostAllowed(
        normalizedHost,
        allowed,
      );
      await this.recreateTargetEnvironment();
      return next;
    } finally {
      this.reconfiguring = false;
    }
  }

  public openDevTools(): void {
    if (this.disposed || this.reconfiguring || this.captureInProgress) return;
    this.view.webContents.openDevTools({ mode: 'detach' });
  }

  public destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.closePopupWindows();
    this.destroyTargetView();
    this.targetSession.setCertificateVerifyProc(null);
    void this.clearTargetSession(this.targetSession);
  }

  private createTargetEnvironment(): void {
    const partition = `${TARGET_PARTITION}-${randomUUID()}`;
    this.targetSession = session.fromPartition(partition, { cache: true });
    configureTargetSession(this.targetSession, this.preferences);

    this.view = new WebContentsView({
      webPreferences: {
        session: this.targetSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webgl: true,
        spellcheck: false,
      },
    });

    this.view.setBackgroundColor('#ffffff');
    this.view.setVisible(false);
    this.mainWindow.contentView.addChildView(this.view);
    this.viewOwner = this.mainWindow;
    this.configureWebContents();
  }

  private async recreateTargetEnvironment(): Promise<void> {
    const targetUrl = this.currentUrl;
    const previousSession = this.targetSession;

    this.closePopupWindows();
    this.destroyTargetView();
    previousSession.setCertificateVerifyProc(null);
    await this.clearTargetSession(previousSession);
    if (this.disposed) return;

    this.createTargetEnvironment();
    this.state = {
      ...EMPTY_STATE,
      url: targetUrl,
      isLoading: Boolean(targetUrl),
    };
    this.emitState();

    if (targetUrl) {
      const loaded = await this.view.webContents
        .loadURL(targetUrl)
        .then(() => true)
        .catch(() => false);
      if (loaded) this.refreshState();
    } else if (this.currentLayout) {
      this.applyInteractiveLayout(this.currentLayout);
    }
  }

  private destroyTargetView(): void {
    const owner = this.viewOwner;
    this.viewOwner = null;
    const webContents = this.view.webContents;
    if (owner && !owner.isDestroyed()) {
      if (!webContents.isDestroyed()) {
        this.view.setVisible(false);
      }
      owner.contentView.removeChildView(this.view);
    }
    this.destroyCaptureHost();
    if (!webContents.isDestroyed()) {
      webContents.close({ waitForBeforeUnload: false });
    }
  }

  private moveTargetViewTo(owner: BaseWindow): void {
    if (this.viewOwner === owner) return;
    const previousOwner = this.viewOwner;
    this.viewOwner = null;
    if (previousOwner && !previousOwner.isDestroyed()) {
      previousOwner.contentView.removeChildView(this.view);
    }
    owner.contentView.addChildView(this.view);
    this.viewOwner = owner;
  }

  private destroyCaptureHost(): void {
    const captureHost = this.captureHost;
    this.captureHost = null;
    if (!captureHost) return;
    if (this.viewOwner === captureHost) {
      if (!captureHost.isDestroyed()) {
        captureHost.contentView.removeChildView(this.view);
      }
      this.viewOwner = null;
    }
    if (!captureHost.isDestroyed()) {
      captureHost.destroy();
    }
  }

  private async clearTargetSession(targetSession: Session): Promise<void> {
    await Promise.allSettled([
      targetSession.clearStorageData(),
      targetSession.clearCache(),
      targetSession.clearAuthCache(),
      targetSession.closeAllConnections(),
    ]);
  }

  private assertEnvironmentAvailable(): void {
    if (this.disposed) {
      throw new Error('対象ページ用セッションはすでに終了しています。');
    }
    if (this.reconfiguring) {
      throw new Error('対象ページ用セッションを再作成しています。');
    }
    if (this.captureInProgress) {
      throw new Error('対象ページを撮影しています。');
    }
  }

  private configureWebContents(): void {
    const webContents = this.view.webContents;
    webContents.setAudioMuted(true);
    webContents.on('before-input-event', (event, input) => {
      dispatchAppShortcutInput(event, input, this.onShortcut);
    });
    this.configurePopupPolicy(webContents);
    this.configureNavigationGuard(webContents, false, (url) => {
      this.setError(
        `${url || '不明なURL'} への移動を拒否しました。http:// または https:// のURLだけを開けます。`,
      );
    });

    webContents.on('did-start-loading', () => {
      this.state = { ...this.state, isLoading: true, error: undefined };
      this.emitState();
    });
    webContents.on('did-stop-loading', () => this.refreshState());
    webContents.on('did-navigate', () => this.refreshState(true));
    webContents.on(
      'did-navigate-in-page',
      (_event, _url, isMainFrame) => {
        if (isMainFrame) this.refreshState(true);
      },
    );
    webContents.on('page-title-updated', () => this.refreshState());
    webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) return;
        this.state = {
          ...this.state,
          url: validatedUrl || this.state.url,
          isLoading: false,
          error: `${errorDescription} (${errorCode})`,
        };
        this.emitState();
      },
    );
    webContents.on('render-process-gone', (_event, details) => {
      this.setError(`ページの描画プロセスが終了しました: ${details.reason}`);
    });
    webContents.on('unresponsive', () => {
      this.setError('ページが応答していません。');
    });
  }

  private configurePopupPolicy(webContents: WebContents): void {
    webContents.setWindowOpenHandler((details) => {
      if (!isAllowedTargetWindowUrl(details.url, true)) {
        const warning = createBlockedPopupWarning(details.url);
        dialog.showMessageBoxSync(this.mainWindow, {
          type: 'warning',
          title: 'リンクを拒否しました',
          message: warning.message,
          detail: warning.detail,
          buttons: ['閉じる'],
          defaultId: CANCEL_BUTTON_ID,
          cancelId: CANCEL_BUTTON_ID,
          noLink: true,
        });
        return { action: 'deny' };
      }

      const warning = createTargetPopupWarning(
        details.url,
        details.postBody !== undefined,
      );
      const response = dialog.showMessageBoxSync(this.mainWindow, {
        type: 'warning',
        title: '新しいウィンドウ',
        message: warning.message,
        detail: warning.detail,
        buttons: ['キャンセル', '新しいウィンドウで開く'],
        defaultId: CANCEL_BUTTON_ID,
        cancelId: CANCEL_BUTTON_ID,
        noLink: true,
      });
      if (response !== CONFIRM_BUTTON_ID) {
        return { action: 'deny' };
      }

      return {
        action: 'allow',
        outlivesOpener: false,
        overrideBrowserWindowOptions: {
          parent: this.mainWindow,
          modal: false,
          show: true,
          width: 900,
          height: 720,
          minWidth: 480,
          minHeight: 360,
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          webPreferences: {
            session: this.targetSession,
            preload: undefined,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            nodeIntegrationInWorker: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            navigateOnDragDrop: false,
            safeDialogs: true,
            webgl: true,
            spellcheck: false,
          },
        },
      };
    });

    webContents.on('did-create-window', (popupWindow) => {
      this.trackPopupWindow(popupWindow);
    });
  }

  private trackPopupWindow(popupWindow: BrowserWindow): void {
    this.popupWindows.add(popupWindow);
    popupWindow.setMenuBarVisibility(false);
    this.configurePopupPolicy(popupWindow.webContents);
    this.configureNavigationGuard(popupWindow.webContents, true);
    popupWindow.once('closed', () => {
      this.popupWindows.delete(popupWindow);
    });
  }

  private configureNavigationGuard(
    webContents: WebContents,
    allowAboutBlank: boolean,
    onBlocked?: (url: string) => void,
  ): void {
    type NavigationEvent = Electron.Event & {
      url?: string;
      isMainFrame?: boolean;
    };

    const guardNavigation = (
      event: NavigationEvent,
      legacyUrl?: string,
      _isInPlace?: boolean,
      legacyIsMainFrame?: boolean,
    ): void => {
      const isMainFrame = event.isMainFrame ?? legacyIsMainFrame ?? true;
      if (!isMainFrame) {
        return;
      }

      const url = event.url ?? legacyUrl ?? '';
      if (!isAllowedTargetWindowUrl(url, allowAboutBlank)) {
        event.preventDefault();
        onBlocked?.(url);
      }
    };

    webContents.on('will-navigate', guardNavigation);
    webContents.on('will-redirect', guardNavigation);
  }

  private closePopupWindows(): void {
    for (const popupWindow of this.popupWindows) {
      if (!popupWindow.isDestroyed()) {
        popupWindow.destroy();
      }
    }
    this.popupWindows.clear();
  }

  private applyInteractiveLayout(layout: TargetViewLayout): void {
    if (!layout.visible || !this.currentUrl) {
      this.view.setVisible(false);
      return;
    }

    const bounds = {
      x: Math.round(layout.x),
      y: Math.round(layout.y),
      width: Math.max(1, Math.round(layout.width)),
      height: Math.max(1, Math.round(layout.height)),
    };
    const scale = Math.min(
      bounds.width / layout.viewport.width,
      bounds.height / layout.viewport.height,
    );

    this.view.setBounds(bounds);
    this.view.setBorderRadius(Math.max(0, Math.round(layout.borderRadius)));
    this.view.webContents.enableDeviceEmulation({
      screenPosition: layout.viewport.mode === 'mobile' ? 'mobile' : 'desktop',
      screenSize: {
        width: layout.viewport.width,
        height: layout.viewport.height,
      },
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: 1,
      viewSize: {
        width: layout.viewport.width,
        height: layout.viewport.height,
      },
      scale,
    });
    this.view.setVisible(true);
  }

  private refreshState(
    clearError = false,
    loadingOverride?: boolean,
  ): void {
    const webContents = this.view.webContents;
    const isLoading = loadingOverride ?? webContents.isLoading();
    this.state = {
      url:
        clearError || !isLoading
          ? webContents.getURL() || this.state.url
          : this.state.url,
      title: webContents.getTitle() || '',
      isLoading,
      canGoBack: webContents.navigationHistory.canGoBack(),
      canGoForward: webContents.navigationHistory.canGoForward(),
      error: clearError ? undefined : this.state.error,
    };
    this.emitState();
    if (this.currentLayout) {
      this.applyInteractiveLayout(this.currentLayout);
    }
  }

  private setError(message: string): void {
    this.state = { ...this.state, isLoading: false, error: message };
    this.emitState();
  }

  private emitState(): void {
    this.onState(this.navigationState);
  }
}
