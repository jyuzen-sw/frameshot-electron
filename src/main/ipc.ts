import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/ipc';
import type { ExportDestination, NavigationState } from '@shared/types';
import { validateCaptureSettings, validateTargetViewLayout } from '@shared/validation';
import type { ExportService } from './export-service';
import type { PreferencesStore } from './preferences-store';
import type { TargetBrowserController } from './target-browser-controller';

interface RegisterIpcOptions {
  mainWindow: BrowserWindow;
  trustedRendererUrl: string;
  targetBrowser: TargetBrowserController;
  exportService: ExportService;
  preferences: PreferencesStore;
}

const HANDLED_CHANNELS = [
  IPC.navigate,
  IPC.goBack,
  IPC.goForward,
  IPC.reload,
  IPC.exportImage,
  IPC.resetSession,
  IPC.openDevTools,
  IPC.getPreferences,
  IPC.setCertificateAllowed,
] as const;

function assertTrustedSender(
  event: IpcMainInvokeEvent | IpcMainEvent,
  mainWindow: BrowserWindow,
  trustedRendererUrl: string,
): void {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    throw new Error('信頼されていない画面からの操作を拒否しました。');
  }

  const mainContents = mainWindow.webContents;
  const senderFrame = event.senderFrame;
  const mainFrame = mainContents.mainFrame;
  if (
    event.sender !== mainContents ||
    senderFrame === null ||
    senderFrame.processId !== mainFrame.processId ||
    senderFrame.routingId !== mainFrame.routingId ||
    event.processId !== senderFrame.processId ||
    event.frameId !== senderFrame.routingId ||
    senderFrame.url !== trustedRendererUrl
  ) {
    throw new Error('信頼されていない画面からの操作を拒否しました。');
  }
}

function installHandle(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, handler);
}

export function registerIpcHandlers({
  mainWindow,
  trustedRendererUrl,
  targetBrowser,
  exportService,
  preferences,
}: RegisterIpcOptions): () => void {
  installHandle(IPC.navigate, async (event, input) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    if (typeof input !== 'string') throw new Error('URLが不正です。');
    return targetBrowser.navigate(input);
  });

  installHandle(IPC.goBack, (event) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    targetBrowser.goBack();
  });

  installHandle(IPC.goForward, (event) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    targetBrowser.goForward();
  });

  installHandle(IPC.reload, (event, ignoreCache) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    targetBrowser.reload(Boolean(ignoreCache));
  });

  installHandle(IPC.exportImage, async (event, rawSettings, rawDestination) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    if (rawDestination !== 'clipboard' && rawDestination !== 'file') {
      throw new Error('書き出し先が不正です。');
    }
    return exportService.exportImage(
      validateCaptureSettings(rawSettings),
      rawDestination as ExportDestination,
    );
  });

  installHandle(IPC.resetSession, async (event) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    await targetBrowser.resetSession();
  });

  installHandle(IPC.openDevTools, (event) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    targetBrowser.openDevTools();
  });

  installHandle(IPC.getPreferences, (event) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    return preferences.get();
  });

  installHandle(IPC.setCertificateAllowed, async (event, host, allowed) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    if (typeof host !== 'string' || host.length > 253) {
      throw new Error('ホスト名が不正です。');
    }
    return targetBrowser.setCertificateAllowed(host, Boolean(allowed));
  });

  const layoutListener = (event: IpcMainEvent, rawLayout: unknown): void => {
    try {
      assertTrustedSender(event, mainWindow, trustedRendererUrl);
      targetBrowser.setLayout(validateTargetViewLayout(rawLayout));
    } catch (error) {
      console.warn('Invalid target view layout:', error);
    }
  };
  ipcMain.removeAllListeners(IPC.setLayout);
  ipcMain.on(IPC.setLayout, layoutListener);

  return () => {
    for (const channel of HANDLED_CHANNELS) {
      ipcMain.removeHandler(channel);
    }
    ipcMain.removeListener(IPC.setLayout, layoutListener);
  };
}

export function sendNavigationState(
  mainWindow: BrowserWindow,
  state: NavigationState,
): void {
  if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(IPC.navigationState, state);
  }
}
