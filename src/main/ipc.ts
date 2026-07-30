import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/ipc';
import type { AppCommand, NavigationState } from '@shared/types';
import { validateCaptureSettings, validateTargetViewLayout } from '@shared/validation';
import type { CaptureService } from './capture-service';
import type { PreferencesStore } from './preferences-store';
import type { TargetBrowserController } from './target-browser-controller';

interface RegisterIpcOptions {
  mainWindow: BrowserWindow;
  trustedRendererUrl: string;
  targetBrowser: TargetBrowserController;
  captureService: CaptureService;
  preferences: PreferencesStore;
}

const HANDLED_CHANNELS = [
  IPC.navigate,
  IPC.goBack,
  IPC.goForward,
  IPC.reload,
  IPC.capture,
  IPC.recompose,
  IPC.save,
  IPC.copy,
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
  captureService,
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

  installHandle(IPC.capture, async (event, rawSettings) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    return captureService.capture(validateCaptureSettings(rawSettings));
  });

  installHandle(IPC.recompose, async (event, rawSettings) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    return captureService.recompose(validateCaptureSettings(rawSettings));
  });

  installHandle(IPC.save, async (event) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    return captureService.saveLatest();
  });

  installHandle(IPC.copy, (event) => {
    assertTrustedSender(event, mainWindow, trustedRendererUrl);
    captureService.copyLatest();
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

export function sendAppCommand(
  mainWindow: BrowserWindow,
  command: AppCommand,
): void {
  if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(IPC.appCommand, command);
  }
}
