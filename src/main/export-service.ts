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
  CaptureSettings,
  CompositionLayout,
  ExportDestination,
  ExportRenderPayload,
  ExportResult,
} from '@shared/types';
import { calculateCompositionLayout } from '@shared/layout';
import { validateCaptureSettings } from '@shared/validation';
import {
  EXPORT_RENDERER_HASH,
  installAppProtocol,
} from './app-protocol';
import { assertImageClipboardSupported } from './clipboard-image';
import { captureAfterWarmup } from './exact-page-capture';
import { ExclusiveOperation } from './exclusive-operation';
import {
  EXPORT_PARTITION,
  ExportResourceStore,
  installExportProtocol,
} from './export-protocol';
import type { TargetBrowserController } from './target-browser-controller';

interface ExportServiceOptions {
  ownerWindow: BrowserWindow;
  targetBrowser: TargetBrowserController;
  rendererUrl: string;
  rendererRoot?: string;
  resolveOutputPath?: (
    settings: CaptureSettings,
  ) => Promise<string | undefined>;
  activateCaptureSurface?: boolean;
}

const EXPORT_STEP_TIMEOUT_MS = 10_000;
const WAIT_FOR_EXPORT_RENDERER_SCRIPT = `new Promise((resolve) => {
  const check = () => {
    if (typeof window.frameShotRenderExport === 'function') {
      resolve(true);
      return;
    }
    setTimeout(check, 16);
  };
  check();
})`;
const WAIT_FOR_CAPTURE_SURFACE_SCRIPT = `Promise.race([
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }),
  new Promise((resolve) => setTimeout(resolve, 250)),
])`;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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

function targetFilePart(targetUrl: string): string {
  try {
    return sanitizeFilePart(new URL(targetUrl).hostname);
  } catch {
    return 'frameshot';
  }
}

function withExportHash(rendererUrl: string): string {
  const url = new URL(rendererUrl);
  url.hash = EXPORT_RENDERER_HASH.slice(1);
  return url.href;
}

function payloadScript(payload: ExportRenderPayload): string {
  const serialized = JSON.stringify(payload)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
  return `(() => {
    const render = window.frameShotRenderExport;
    if (typeof render !== 'function') {
      throw new Error('書き出しキャンバスを初期化できませんでした。');
    }
    return render(${serialized});
  })()`;
}

function hasExpectedAspectRatio(
  actual: { width: number; height: number },
  expected: { width: number; height: number },
): boolean {
  if (actual.width <= 0 || actual.height <= 0) return false;
  return (
    Math.abs(
      actual.width / actual.height - expected.width / expected.height,
    ) <= 0.001
  );
}

export class ExportService {
  private readonly operations = new ExclusiveOperation();
  private readonly exportResources = new ExportResourceStore();
  private readonly exportSession: Session;
  private readonly exportRendererUrl: string;
  private disposeExportProtocol: (() => void) | null;
  private disposeRendererProtocol: (() => void) | null = null;
  private activeExportWindow: BrowserWindow | null = null;
  private disposed = false;

  public constructor(private readonly options: ExportServiceOptions) {
    this.exportRendererUrl = withExportHash(options.rendererUrl);
    this.exportSession = session.fromPartition(EXPORT_PARTITION, {
      cache: false,
    });
    if (options.rendererRoot) {
      this.disposeRendererProtocol = installAppProtocol(
        this.exportSession,
        options.rendererRoot,
      );
    }
    this.disposeExportProtocol = installExportProtocol(
      this.exportSession,
      this.exportResources,
    );
  }

  public async exportImage(
    settings: CaptureSettings,
    destination: ExportDestination,
  ): Promise<ExportResult> {
    return this.operations.run(async () => {
      this.assertNotDisposed();
      const validatedSettings = validateCaptureSettings(settings);
      const { artboard } = calculateCompositionLayout(validatedSettings);
      if (destination !== 'clipboard' && destination !== 'file') {
        throw new Error('書き出し先が不正です。');
      }
      if (destination === 'clipboard') {
        assertImageClipboardSupported();
      }

      let outputPath: string | undefined;
      if (destination === 'file') {
        outputPath = await this.chooseOutputPath(validatedSettings, artboard);
        if (!outputPath) {
          return {
            destination,
            completed: false,
            width: artboard.width,
            height: artboard.height,
          };
        }
      }

      const composite = await this.createComposite(
        validatedSettings,
        artboard,
      );
      this.assertNotDisposed();

      if (destination === 'clipboard') {
        // Do not read back in this process: Electron 43 can crash on Windows
        // after a synchronous clipboard write/read sequence.
        clipboard.writeImage(composite, 'clipboard');
      } else {
        await fs.writeFile(outputPath!, composite.toPNG());
      }

      return {
        destination,
        completed: true,
        width: artboard.width,
        height: artboard.height,
        exportedAt: new Date().toISOString(),
        ...(outputPath ? { path: outputPath } : {}),
      };
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (
      this.activeExportWindow &&
      !this.activeExportWindow.isDestroyed()
    ) {
      this.activeExportWindow.destroy();
    }
    this.activeExportWindow = null;
    this.disposeExportProtocol?.();
    this.disposeExportProtocol = null;
    this.disposeRendererProtocol?.();
    this.disposeRendererProtocol = null;
  }

  private async chooseOutputPath(
    settings: CaptureSettings,
    artboard: CompositionLayout['artboard'],
  ): Promise<string | undefined> {
    if (this.options.resolveOutputPath) {
      return this.options.resolveOutputPath(settings);
    }
    const defaultPath = path.join(
      app.getPath('pictures'),
      `${targetFilePart(this.options.targetBrowser.currentUrl)}-${dateStamp(new Date())}-${artboard.width}x${artboard.height}.png`,
    );
    const result = await dialog.showSaveDialog(this.options.ownerWindow, {
      title: 'PNGを書き出す',
      defaultPath,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return undefined;
    return result.filePath.toLowerCase().endsWith('.png')
      ? result.filePath
      : `${result.filePath}.png`;
  }

  private async createComposite(
    settings: CaptureSettings,
    artboard: CompositionLayout['artboard'],
  ): Promise<NativeImage> {
    const pageImage =
      await this.options.targetBrowser.captureViewport(settings);
    this.assertNotDisposed();
    const urls = this.exportResources.create(
      Uint8Array.from(pageImage.toPNG()),
    );
    const payload: ExportRenderPayload = {
      settings,
      pageImageUrl: urls.pageImageUrl,
      targetUrl: this.options.targetBrowser.currentUrl,
    };
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
        backgroundColor: '#000000',
        paintWhenInitiallyHidden: true,
        enableLargerThanScreen: true,
        ...(this.options.activateCaptureSurface
          ? {
              focusable: false,
              skipTaskbar: true,
              ...(process.platform === 'win32' ? { opacity: 0 } : {}),
            }
          : {}),
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
        if (destination !== this.exportRendererUrl) {
          event.preventDefault();
        }
      };
      exportWindow.webContents.on('will-navigate', guardNavigation);
      exportWindow.webContents.on('will-redirect', guardNavigation);

      await withExportTimeout(
        exportWindow.loadURL(this.exportRendererUrl),
        '書き出し画面の読み込み',
      );
      exportWindow.webContents.setZoomFactor(1);
      await withExportTimeout(
        exportWindow.webContents.executeJavaScript(
          WAIT_FOR_EXPORT_RENDERER_SCRIPT,
          true,
        ),
        '書き出しキャンバスの初期化',
      );
      if (this.options.activateCaptureSurface) {
        exportWindow.setContentSize(
          settings.outputWidth,
          settings.outputHeight,
        );
        exportWindow.showInactive();
      }
      await withExportTimeout(
        exportWindow.webContents.executeJavaScript(
          payloadScript(payload),
          true,
        ),
        '書き出しキャンバスの描画',
      );

      const captured = await this.captureExportWindow(
        exportWindow,
        artboard,
      );
      if (captured.isEmpty()) {
        throw new Error('完成画像の生成に失敗しました。');
      }

      const capturedSize = captured.getSize();
      const normalized =
        capturedSize.width === artboard.width &&
        capturedSize.height === artboard.height
          ? captured
          : captured.resize({
              width: artboard.width,
              height: artboard.height,
              quality: 'best',
            });
      this.assertNotDisposed();
      return nativeImage.createFromBuffer(normalized.toPNG());
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

  private async captureExportWindow(
    exportWindow: BrowserWindow,
    artboard: CompositionLayout['artboard'],
  ): Promise<NativeImage> {
    return captureAfterWarmup(
      {
        prepareCapture: async () => {
          exportWindow.webContents.invalidate();
          await withExportTimeout(
            exportWindow.webContents.executeJavaScript(
              WAIT_FOR_CAPTURE_SURFACE_SCRIPT,
              true,
            ),
            '書き出し画面の再描画',
          );
          await delay(50);
        },
        // Do not add stayAwake: Electron 43 can crash while cancelling its capture wake lock on Windows.
        capture: () =>
          withExportTimeout(
            exportWindow.webContents.capturePage(artboard, {
              stayHidden: !this.options.activateCaptureSurface,
            }),
            '完成画像の取得',
          ),
      },
      (image) =>
        !image.isEmpty() &&
        hasExpectedAspectRatio(image.getSize(), artboard),
      (image) => {
        if (image.isEmpty()) {
          return new Error('完成画像の生成に失敗しました。');
        }
        const actual = image.getSize();
        return new Error(
          `完成画像の取得比率が一致しません。期待: ${artboard.width}x${artboard.height}、実際: ${actual.width}x${actual.height}`,
        );
      },
    );
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('書き出しサービスはすでに終了しています。');
    }
  }
}
