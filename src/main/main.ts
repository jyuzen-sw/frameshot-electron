import path from 'node:path';
import { app, BrowserWindow, session } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import {
  APP_ENTRY_URL,
  installAppProtocol,
  registerAppSchemePrivileges,
} from './app-protocol';
import { installApplicationMenu } from './app-menu';
import { CaptureService } from './capture-service';
import { registerIpcHandlers, sendNavigationState } from './ipc';
import {
  configureMainSession,
  installMainWindowNavigationGuard,
  normalizeTrustedRendererUrl,
} from './main-window-security';
import { PreferencesStore } from './preferences-store';
import { TargetBrowserController } from './target-browser-controller';

const shouldQuitForSquirrel =
  process.platform === 'win32' && squirrelStartup;

app.setName('FrameShot');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.squirrel.frameshot.frameshot');
}
registerAppSchemePrivileges();
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

let mainWindow: BrowserWindow | null = null;
let mainWindowCreation: Promise<void> | null = null;
let disposeCurrentWindow: (() => void) | null = null;
let disposeAppProtocol: (() => void) | null = null;
let isQuitting = false;

async function createMainWindow(): Promise<void> {
  const preferences = new PreferencesStore();
  await preferences.load();
  if (isQuitting) return;

  const trustedRendererUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? normalizeTrustedRendererUrl(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    : APP_ENTRY_URL;

  const window = new BrowserWindow({
    title: 'FrameShot',
    width: 1500,
    height: 930,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    backgroundColor: '#0a0d14',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow = window;

  const targetBrowser = new TargetBrowserController(
    window,
    preferences,
    (state) => sendNavigationState(window, state),
  );
  const removeNavigationGuard = installMainWindowNavigationGuard({
    window,
    targetBrowser,
    trustedRendererUrl,
  });
  const captureService = new CaptureService(window, targetBrowser);
  const removeIpcHandlers = registerIpcHandlers({
    mainWindow: window,
    trustedRendererUrl,
    targetBrowser,
    captureService,
    preferences,
  });

  let disposed = false;
  const disposeWindow = () => {
    if (disposed) return;
    disposed = true;
    removeNavigationGuard();
    removeIpcHandlers();
    captureService.dispose();
    targetBrowser.destroy();
  };
  disposeCurrentWindow = disposeWindow;

  window.on('closed', () => {
    disposeWindow();
    if (disposeCurrentWindow === disposeWindow) {
      disposeCurrentWindow = null;
    }
    if (mainWindow === window) mainWindow = null;
  });

  installApplicationMenu(window);
  window.once('ready-to-show', () => window.show());

  try {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      await window.loadURL(trustedRendererUrl);
    } else {
      await window.loadURL(APP_ENTRY_URL);
    }
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}

function ensureMainWindow(): Promise<void> {
  if (isQuitting) return Promise.resolve();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return Promise.resolve();
  }
  if (!mainWindowCreation) {
    mainWindowCreation = createMainWindow().finally(() => {
      mainWindowCreation = null;
    });
  }
  return mainWindowCreation;
}

if (shouldQuitForSquirrel) {
  app.quit();
} else {
  void app
    .whenReady()
    .then(async () => {
      configureMainSession(session.defaultSession);
      disposeAppProtocol = installAppProtocol(
        session.defaultSession,
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`),
      );
      await ensureMainWindow();
      app.on('activate', () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          void ensureMainWindow().catch((error) => {
            console.error('Main Windowを再作成できませんでした:', error);
          });
        }
      });
    })
    .catch((error) => {
      console.error('FrameShotを起動できませんでした:', error);
      app.quit();
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  disposeCurrentWindow?.();
  disposeCurrentWindow = null;
  disposeAppProtocol?.();
  disposeAppProtocol = null;
});
