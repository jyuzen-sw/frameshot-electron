import path from 'node:path';
import { app, BrowserWindow, Menu, session } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import {
  APP_ENTRY_URL,
  installAppProtocol,
  registerAppSchemePrivileges,
} from './app-protocol';
import { ExportService } from './export-service';
import { registerExportSchemePrivileges } from './export-protocol';
import {
  registerIpcHandlers,
  sendAppShortcut,
  sendNavigationState,
} from './ipc';
import {
  configureMainSession,
  installMainWindowNavigationGuard,
  normalizeTrustedRendererUrl,
} from './main-window-security';
import { PreferencesStore } from './preferences-store';
import { TargetBrowserController } from './target-browser-controller';

const shouldQuitForSquirrel =
  process.platform === 'win32' && squirrelStartup;
const isHeadlessE2e =
  app.isPackaged &&
  process.argv.includes('--frameshot-e2e-headless') &&
  process.env.FRAMESHOT_E2E_HEADLESS === '1';
// Linux Ozone and Windows Chromium cannot size the embedded live surface while
// the headless owner remains hidden.
const needsVisibleHeadlessSurface =
  isHeadlessE2e &&
  (process.platform === 'linux' || process.platform === 'win32');
const needsActiveCaptureSurface =
  process.platform === 'win32' || needsVisibleHeadlessSurface;

app.setName('FrameShot');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.squirrel.frameshot.frameshot');
}
registerAppSchemePrivileges();
registerExportSchemePrivileges();
Menu.setApplicationMenu(null);
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

const bundledRendererRoot = path.join(
  __dirname,
  `../renderer/${MAIN_WINDOW_VITE_NAME}`,
);

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
    useContentSize: true,
    show: false,
    backgroundColor: '#f3f5f9',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  window.setMenuBarVisibility(false);
  mainWindow = window;

  const targetBrowser = new TargetBrowserController(
    window,
    preferences,
    (state) => sendNavigationState(window, state),
    (shortcut) => {
      if (
        shortcut === 'focus-url' &&
        !window.webContents.isDestroyed()
      ) {
        window.webContents.focus();
      }
      sendAppShortcut(window, shortcut);
    },
    needsActiveCaptureSurface,
  );
  const removeNavigationGuard = installMainWindowNavigationGuard({
    window,
    targetBrowser,
    trustedRendererUrl,
  });
  const exportService = new ExportService({
    ownerWindow: window,
    targetBrowser,
    rendererUrl: trustedRendererUrl,
    rendererRoot: MAIN_WINDOW_VITE_DEV_SERVER_URL
      ? undefined
      : bundledRendererRoot,
    activateCaptureSurface: needsActiveCaptureSurface,
    ...(isHeadlessE2e
      ? {
          resolveOutputPath: async () =>
            path.join(app.getPath('userData'), 'e2e-export.png'),
        }
      : {}),
  });
  const removeIpcHandlers = registerIpcHandlers({
    mainWindow: window,
    trustedRendererUrl,
    targetBrowser,
    exportService,
    preferences,
  });

  let disposed = false;
  const disposeWindow = () => {
    if (disposed) return;
    disposed = true;
    removeNavigationGuard();
    removeIpcHandlers();
    exportService.dispose();
    targetBrowser.destroy();
  };
  disposeCurrentWindow = disposeWindow;

  window.on('close', disposeWindow);

  window.on('closed', () => {
    if (disposeCurrentWindow === disposeWindow) {
      disposeCurrentWindow = null;
    }
    if (mainWindow === window) mainWindow = null;
  });

  window.once('ready-to-show', () => {
    if (isHeadlessE2e) {
      console.log(
        'FrameShot E2E headless mode: using deterministic file exports.',
      );
    }
    if (!isHeadlessE2e || needsVisibleHeadlessSurface) {
      window.show();
    }
  });

  try {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      await window.loadURL(trustedRendererUrl);
    } else {
      await window.loadURL(APP_ENTRY_URL);
    }
  } catch (error) {
    disposeWindow();
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
        bundledRendererRoot,
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
