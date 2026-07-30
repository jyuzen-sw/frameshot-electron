import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  nativeImage,
  session,
  type NativeImage,
  type Session,
} from 'electron';
import type {
  CaptureResult,
  CaptureSettings,
  SaveCaptureResult,
} from '@shared/types';
import { validateCaptureSettings } from '@shared/validation';
import { buildCompositionHtml } from './composition-html';
import { ExclusiveOperation } from './exclusive-operation';
import {
  EXPORT_PARTITION,
  ExportResourceStore,
  installExportProtocol,
} from './export-protocol';
import type { TargetBrowserController } from './target-browser-controller';

interface CachedPageCapture {
  png: Uint8Array<ArrayBuffer>;
  targetUrl: string;
}

const EXPORT_STEP_TIMEOUT_MS = 10_000;

async function withExportTimeout<T>(
  operation: Promise<T>,
  step: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${step}がタイムアウトしました。`)),
          EXPORT_STEP_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function sanitizeFilePart(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 70);
  return normalized || 'frameshot';
}

function dateStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

const WAIT_FOR_COMPOSITION_SCRIPT = `
  (async () => {
    const image = document.getElementById('page-image');
    if (!(image instanceof HTMLImageElement)) {
      throw new Error('合成対象のページ画像がありません。');
    }

    if (!image.complete) {
      await new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener(
          'error',
          () => reject(new Error('ページ画像を読み込めませんでした。')),
          { once: true },
        );
      });
    }
    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error('ページ画像を読み込めませんでした。');
    }

    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    await Promise.race([
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
      new Promise((resolve) => setTimeout(resolve, 250)),
    ]);
    return true;
  })()
`;

export class CaptureService {
  private readonly operations = new ExclusiveOperation();
  private readonly exportResources = new ExportResourceStore();
  private readonly exportSession: Session;
  private disposeExportProtocol: (() => void) | null;
  private cachedPage: CachedPageCapture | null = null;
  private latestComposite: NativeImage | null = null;
  private latestSettings: CaptureSettings | null = null;
  private activeExportWindow: BrowserWindow | null = null;
  private disposed = false;

  public constructor(
    private readonly ownerWindow: BrowserWindow,
    private readonly targetBrowser: TargetBrowserController,
  ) {
    this.exportSession = session.fromPartition(EXPORT_PARTITION, {
      cache: false,
    });
    this.disposeExportProtocol = installExportProtocol(
      this.exportSession,
      this.exportResources,
    );
  }

  public async capture(settings: CaptureSettings): Promise<CaptureResult> {
    return this.operations.run(async () => {
      this.assertNotDisposed();
      const validatedSettings = validateCaptureSettings(settings);
      const pageImage =
        await this.targetBrowser.captureViewport(validatedSettings);
      this.assertNotDisposed();
      const nextPage = {
        png: Uint8Array.from(pageImage.toPNG()),
        targetUrl: this.targetBrowser.currentUrl,
      };
      const result = await this.compose(validatedSettings, nextPage);
      this.assertNotDisposed();
      this.cachedPage = nextPage;
      return result;
    });
  }

  public async recompose(settings: CaptureSettings): Promise<CaptureResult> {
    return this.operations.run(async () => {
      this.assertNotDisposed();
      if (!this.cachedPage) {
        throw new Error('先にページを撮影してください。');
      }
      return this.compose(validateCaptureSettings(settings));
    });
  }

  public async saveLatest(): Promise<SaveCaptureResult> {
    if (!this.latestComposite || !this.latestSettings) {
      throw new Error('保存する画像がありません。');
    }

    const composite = this.latestComposite;
    const settings = { ...this.latestSettings };
    const cachedPage = this.cachedPage;
    const targetName = cachedPage
      ? sanitizeFilePart(new URL(cachedPage.targetUrl).hostname)
      : 'frameshot';
    const defaultPath = path.join(
      app.getPath('pictures'),
      `${targetName}-${dateStamp(new Date())}-${settings.outputWidth}x${settings.outputHeight}.png`,
    );

    const result = await dialog.showSaveDialog(this.ownerWindow, {
      title: 'スクリーンショットを保存',
      defaultPath,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });

    if (result.canceled || !result.filePath) {
      return { saved: false };
    }

    const outputPath = result.filePath.toLowerCase().endsWith('.png')
      ? result.filePath
      : `${result.filePath}.png`;
    await fs.writeFile(outputPath, composite.toPNG());
    return { saved: true, path: outputPath };
  }

  public copyLatest(): void {
    if (!this.latestComposite) {
      throw new Error('コピーする画像がありません。');
    }
    clipboard.writeImage(this.latestComposite);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cachedPage = null;
    this.latestComposite = null;
    this.latestSettings = null;
    if (
      this.activeExportWindow &&
      !this.activeExportWindow.isDestroyed()
    ) {
      this.activeExportWindow.destroy();
    }
    this.activeExportWindow = null;
    this.disposeExportProtocol?.();
    this.disposeExportProtocol = null;
  }

  private async compose(
    settings: CaptureSettings,
    pageCapture: CachedPageCapture | null = this.cachedPage,
  ): Promise<CaptureResult> {
    if (!pageCapture) {
      throw new Error('合成するページ画像がありません。');
    }

    const cachedPage = pageCapture;
    const urls = this.exportResources.create(
      cachedPage.png,
      ({ pageImageUrl }) =>
        buildCompositionHtml({
          settings,
          pageImageUrl,
          targetUrl: cachedPage.targetUrl,
        }),
    );
    let exportWindow: BrowserWindow | null = null;

    try {
      exportWindow = new BrowserWindow({
        show: false,
        useContentSize: true,
        width: settings.outputWidth,
        height: settings.outputHeight,
        resizable: false,
        frame: false,
        transparent: false,
        backgroundColor: settings.gradientFrom,
        paintWhenInitiallyHidden: true,
        enableLargerThanScreen: true,
        webPreferences: {
          session: this.exportSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          backgroundThrottling: false,
          spellcheck: false,
        },
      });
      this.activeExportWindow = exportWindow;
      exportWindow.webContents.setWindowOpenHandler(() => ({
        action: 'deny',
      }));
      const guardNavigation = (
        event: Electron.Event,
        destination: string,
      ): void => {
        if (destination !== urls.documentUrl) {
          event.preventDefault();
        }
      };
      exportWindow.webContents.on('will-navigate', guardNavigation);
      exportWindow.webContents.on('will-redirect', guardNavigation);

      await withExportTimeout(
        exportWindow.loadURL(urls.documentUrl),
        '合成画面の読み込み',
      );
      exportWindow.webContents.setZoomFactor(1);
      await withExportTimeout(
        exportWindow.webContents.executeJavaScript(
          WAIT_FOR_COMPOSITION_SCRIPT,
          true,
        ),
        '合成画像の描画待機',
      );

      const captured = await withExportTimeout(
        exportWindow.webContents.capturePage(
          {
            x: 0,
            y: 0,
            width: settings.outputWidth,
            height: settings.outputHeight,
          },
          { stayHidden: true, stayAwake: true },
        ),
        '完成画像の取得',
      );
      if (captured.isEmpty()) {
        throw new Error('完成画像の合成に失敗しました。');
      }

      const capturedSize = captured.getSize();
      const normalized =
        capturedSize.width === settings.outputWidth &&
        capturedSize.height === settings.outputHeight
          ? captured
          : captured.resize({
              width: settings.outputWidth,
              height: settings.outputHeight,
              quality: 'best',
            });

      // Clone via PNG so the image is independent from the hidden composition window.
      this.assertNotDisposed();
      this.latestComposite = nativeImage.createFromBuffer(normalized.toPNG());
      this.latestSettings = { ...settings };

      return {
        dataUrl: this.latestComposite.toDataURL(),
        width: settings.outputWidth,
        height: settings.outputHeight,
        capturedAt: new Date().toISOString(),
      };
    } finally {
      this.exportResources.remove(urls.token);
      if (exportWindow && !exportWindow.isDestroyed()) {
        exportWindow.destroy();
      }
      if (this.activeExportWindow === exportWindow) {
        this.activeExportWindow = null;
      }
    }
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('撮影サービスはすでに終了しています。');
    }
  }
}
