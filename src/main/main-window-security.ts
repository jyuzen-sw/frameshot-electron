import {
  dialog,
  type BrowserWindow,
  type Session,
  type WebContentsWillNavigateEventParams,
  type WebContentsWillRedirectEventParams,
} from 'electron';
import type { TargetBrowserController } from './target-browser-controller';

const MAX_EXTERNAL_URL_LENGTH = 8192;
const configuredSessions = new WeakSet<Session>();

export function normalizeTrustedRendererUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  parsed.hash = '';
  return parsed.href;
}

export function parseExternalHttpUrl(rawUrl: string): URL | null {
  if (!rawUrl || rawUrl.length > MAX_EXTERNAL_URL_LENGTH) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username ||
    parsed.password
  ) {
    return null;
  }
  return parsed;
}

export function configureMainSession(appSession: Session): void {
  if (configuredSessions.has(appSession)) return;
  configuredSessions.add(appSession);

  appSession.setPermissionCheckHandler(() => false);
  appSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  appSession.on('will-download', (event) => event.preventDefault());
}

interface InstallMainWindowNavigationGuardOptions {
  window: BrowserWindow;
  targetBrowser: TargetBrowserController;
  trustedRendererUrl: string;
}

export function installMainWindowNavigationGuard({
  window,
  targetBrowser,
  trustedRendererUrl,
}: InstallMainWindowNavigationGuardOptions): () => void {
  let promptInProgress = false;
  let disposed = false;
  const webContents = window.webContents;

  const requestTargetNavigation = async (rawUrl: string): Promise<void> => {
    const parsed = parseExternalHttpUrl(rawUrl);
    if (!parsed || promptInProgress || disposed || window.isDestroyed()) return;

    promptInProgress = true;
    try {
      const result = await dialog.showMessageBox(window, {
        type: 'warning',
        title: '外部サイトを開きますか？',
        message: '撮影対象の操作画面で外部サイトを開きます。',
        detail: parsed.href,
        buttons: ['対象画面で開く', 'キャンセル'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      if (
        result.response === 0 &&
        !disposed &&
        !window.isDestroyed()
      ) {
        await targetBrowser.navigate(parsed.href);
      }
    } catch (error) {
      console.error('外部サイトを開けませんでした:', error);
    } finally {
      promptInProgress = false;
    }
  };

  const guardNavigation = (
    event:
      | Electron.Event<WebContentsWillNavigateEventParams>
      | Electron.Event<WebContentsWillRedirectEventParams>,
  ): void => {
    if (normalizeTrustedRendererUrl(event.url) === trustedRendererUrl) return;
    event.preventDefault();
    void requestTargetNavigation(event.url);
  };

  webContents.on('will-navigate', guardNavigation);
  webContents.on('will-redirect', guardNavigation);
  webContents.setWindowOpenHandler(({ url }) => {
    void requestTargetNavigation(url);
    return { action: 'deny' };
  });

  return () => {
    disposed = true;
    if (webContents.isDestroyed()) return;
    webContents.removeListener('will-navigate', guardNavigation);
    webContents.removeListener('will-redirect', guardNavigation);
    webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  };
}
