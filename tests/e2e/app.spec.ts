import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { expect, test } from '@playwright/test';
import { calculateCompositionLayout } from '../../src/shared/layout';
import type {
  CaptureSettings,
  ExportResult,
} from '../../src/shared/types';

interface RunningApp {
  browserEndpoint: string;
  cdp: CdpPage;
  child: ChildProcess;
  closed: Promise<ChildProcessCloseResult>;
  output: () => string;
}

interface ChildProcessCloseResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

interface ClipboardProbe {
  height: number;
  pngPath: string;
  width: number;
}

interface FixtureRequest {
  cacheControl: string;
  pragma: string;
  url: string;
}

interface FixtureServer {
  failedPaths: Set<string>;
  requests: FixtureRequest[];
  server: Server;
  url: string;
}

interface CdpResponse {
  id?: number;
  result?: {
    result?: {
      value?: unknown;
      description?: string;
    };
    exceptionDetails?: {
      text?: string;
      exception?: { description?: string };
    };
  };
  error?: { message?: string };
}

interface PendingCdpRequest {
  method: string;
  resolve: (response: CdpResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const CDP_COMMAND_TIMEOUT_MS = 15_000;
const HEADLESS_E2E = process.env.FRAMESHOT_E2E_HEADED !== '1';
const KEYBOARD_INPUT = {
  ArrowDown: { code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  Enter: { code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 },
} as const;

function isWslHost(): boolean {
  return (
    process.platform === 'linux' &&
    (Boolean(process.env.WSL_DISTRO_NAME) ||
      Boolean(process.env.WSL_INTEROP) ||
      os.release().toLowerCase().includes('microsoft'))
  );
}

function logE2e(message: string): void {
  console.log(`[e2e] ${new Date().toISOString()} ${message}`);
}

function logElectronOutput(output: string): void {
  console.error(
    `[e2e] ${new Date().toISOString()} Electron process output:\n${
      output || '(no output captured)'
    }`,
  );
}

class CdpPage {
  private nextId = 1;
  private readonly pending = new Map<number, PendingCdpRequest>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpResponse;
      if (message.id === undefined) return;
      const request = this.takePending(message.id);
      if (!request) return;
      if (message.error) {
        request.reject(
          new Error(
            `DevTools command ${request.method} (id ${message.id}) failed: ${
              message.error.message ?? 'unknown DevTools error'
            }`,
          ),
        );
      } else {
        request.resolve(message);
      }
    });
    socket.addEventListener('close', () => {
      const pending = [...this.pending.entries()];
      this.pending.clear();
      for (const [id, request] of pending) {
        clearTimeout(request.timer);
        request.reject(
          new Error(
            `DevTools connection closed while waiting for ${request.method} (id ${id}).`,
          ),
        );
      }
    });
  }

  public static async connect(endpoint: string): Promise<CdpPage> {
    logE2e('Connecting to the main page DevTools WebSocket.');
    const socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timed out opening the page DevTools socket.')),
        10_000,
      );
      socket.addEventListener(
        'open',
        () => {
          clearTimeout(timeout);
          logE2e('Main page DevTools WebSocket connected.');
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        'error',
        () => {
          clearTimeout(timeout);
          reject(new Error('Could not open the page DevTools socket.'));
        },
        { once: true },
      );
    });
    const page = new CdpPage(socket);
    await page.send('Runtime.enable');
    logE2e('Runtime.enable completed.');
    return page;
  }

  public async evaluate<T>(expression: string): Promise<T> {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.result?.exceptionDetails) {
      const details = response.result.exceptionDetails;
      throw new Error(
        details.exception?.description ??
          details.text ??
          'Runtime evaluation failed.',
      );
    }
    return response.result?.result?.value as T;
  }

  public async pressKey(key: keyof typeof KEYBOARD_INPUT): Promise<void> {
    const input = KEYBOARD_INPUT[key];
    const text = 'text' in input ? input.text : undefined;
    await this.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      key,
      code: input.code,
      text,
      unmodifiedText: text,
      windowsVirtualKeyCode: input.windowsVirtualKeyCode,
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code: input.code,
      windowsVirtualKeyCode: input.windowsVirtualKeyCode,
    });
  }

  public async setViewport(width: number, height: number): Promise<void> {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  public async clearViewport(): Promise<void> {
    await this.send('Emulation.clearDeviceMetricsOverride');
  }

  public close(): void {
    this.socket.close();
  }

  private send(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = CDP_COMMAND_TIMEOUT_MS,
  ): Promise<CdpResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const request = this.takePending(id);
        if (!request) return;
        request.reject(
          new Error(
            `DevTools command ${method} (id ${id}) timed out after ${
              timeoutMs / 1_000
            } seconds (${timeoutMs} ms).`,
          ),
        );
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.takePending(id);
        reject(
          new Error(
            `Could not send DevTools command ${method} (id ${id}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
      }
    });
  }

  private takePending(id: number): PendingCdpRequest | undefined {
    const request = this.pending.get(id);
    if (!request) return undefined;
    this.pending.delete(id);
    clearTimeout(request.timer);
    return request;
  }
}

function packagedExecutable(): string {
  logE2e(
    `Resolving packaged executable for ${process.platform}/${process.arch}.`,
  );
  const outDirectory = path.resolve('out');
  const suffix = `-${process.platform}-${process.arch}`;
  const packageDirectory = fs
    .readdirSync(outDirectory, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.endsWith(suffix));

  if (!packageDirectory) {
    throw new Error(`Packaged application was not found in ${outDirectory}.`);
  }

  const base = path.join(outDirectory, packageDirectory.name);
  let executable: string;
  if (process.platform === 'win32') {
    executable = path.join(base, 'frameshot.exe');
  } else if (process.platform === 'darwin') {
    const appBundle = fs
      .readdirSync(base, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && entry.name.endsWith('.app'));
    if (!appBundle) throw new Error('macOS app bundle was not found.');
    executable = path.join(
      base,
      appBundle.name,
      'Contents',
      'MacOS',
      'frameshot',
    );
  } else {
    executable = path.join(base, 'frameshot');
  }
  logE2e(`Packaged executable resolved: ${executable}`);
  return executable;
}

function developmentElectronExecutable(): string {
  const base = path.resolve('node_modules', 'electron', 'dist');
  if (process.platform === 'win32') {
    return path.join(base, 'electron.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(
      base,
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron',
    );
  }
  return path.join(base, 'electron');
}

async function probeClipboardImage(
  tempDirectory: string,
  label: string,
): Promise<ClipboardProbe> {
  const pngPath = path.join(tempDirectory, `${label}.png`);
  const userDataDirectory = path.join(
    tempDirectory,
    `${label}-clipboard-probe-data`,
  );
  const args = [
    '--disable-gpu',
    ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    `--user-data-dir=${userDataDirectory}`,
    path.resolve('tests/e2e/clipboard-probe.cjs'),
    pngPath,
  ];
  let output = '';
  const child = spawn(developmentElectronExecutable(), args, {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      TMPDIR: tempDirectory,
      TEMP: tempDirectory,
      TMP: tempDirectory,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = observeChildProcessClose(child);
  child.stdout?.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    output += String(chunk);
  });

  const result = await new Promise<ChildProcessCloseResult>(
    (resolve, reject) => {
      const onError = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };
      const timeout = setTimeout(() => {
        child.off('error', onError);
        child.kill('SIGKILL');
        reject(new Error(`Clipboard probe timed out.\n${output}`));
      }, 20_000);
      child.once('error', onError);
      closed.then((closeResult) => {
        child.off('error', onError);
        clearTimeout(timeout);
        resolve(closeResult);
      }, reject);
    },
  );
  if (result.code !== 0 || result.signal !== null) {
    throw new Error(
      `Clipboard probe failed (${result.code ?? result.signal}).\n${output}`,
    );
  }

  const match = output.match(
    /FRAMESHOT_CLIPBOARD_PROBE:(\{"width":\d+,"height":\d+\})/,
  );
  if (!match?.[1]) {
    throw new Error(`Clipboard probe did not report an image.\n${output}`);
  }
  const size = JSON.parse(match[1]) as {
    width: number;
    height: number;
  };
  return { ...size, pngPath };
}

function readPngDimensions(pngPath: string): {
  height: number;
  width: number;
} {
  const png = fs.readFileSync(pngPath);
  const signature = '89504e470d0a1a0a';
  if (
    png.length < 24 ||
    png.subarray(0, 8).toString('hex') !== signature ||
    png.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    throw new Error(`${pngPath} is not a valid PNG image.`);
  }
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

async function exportedPng(
  tempDirectory: string,
  label: string,
  result: ExportResult,
): Promise<ClipboardProbe> {
  if (!HEADLESS_E2E) {
    return probeClipboardImage(tempDirectory, label);
  }
  const expectedPath = path.join(
    tempDirectory,
    'user-data',
    'e2e-export.png',
  );
  expect(result.path).toEqual(expect.any(String));
  const actualPath = result.path!;
  expect(fs.realpathSync(actualPath)).toBe(
    fs.realpathSync(expectedPath),
  );
  return {
    ...readPngDimensions(actualPath),
    pngPath: actualPath,
  };
}

async function samplePngPixels(
  cdp: CdpPage,
  pngPath: string,
  points: ReadonlyArray<{ x: number; y: number }>,
): Promise<number[][]> {
  const dataUrl = `data:image/png;base64,${fs
    .readFileSync(pngPath)
    .toString('base64')}`;
  return cdp.evaluate<number[][]>(`
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
          reject(new Error('Could not create the PNG sampling context.'));
          return;
        }
        context.drawImage(image, 0, 0);
        resolve(${JSON.stringify(points)}.map(({ x, y }) =>
          Array.from(context.getImageData(x, y, 1, 1).data)
        ));
      }, { once: true });
      image.addEventListener(
        'error',
        () => reject(new Error('Could not load the probed clipboard PNG.')),
        { once: true },
      );
      image.src = ${JSON.stringify(dataUrl)};
    })
  `);
}

function expectPixelNear(
  actual: number[],
  expected: readonly [number, number, number, number],
): void {
  expect(actual).toHaveLength(4);
  for (const [index, channel] of expected.entries()) {
    const actualChannel = actual[index] ?? -255;
    expect(
      Math.abs(actualChannel - channel),
      `RGBA channel ${index}: expected ${channel}, received ${actualChannel} in ${JSON.stringify(actual)}`,
    ).toBeLessThanOrEqual(8);
  }
}

function compositionViewportSamplePoints(
  settings: CaptureSettings,
): Array<{ x: number; y: number }> {
  const layout = calculateCompositionLayout(settings);
  const markerInset = 32 * layout.scale;
  return [
    {
      x: Math.round(layout.screen.x + markerInset - layout.artboard.x),
      y: Math.round(layout.screen.y + markerInset - layout.artboard.y),
    },
    {
      x: Math.round(
        layout.screen.x +
          layout.screen.width -
          markerInset -
          layout.artboard.x,
      ),
      y: Math.round(layout.screen.y + markerInset - layout.artboard.y),
    },
    {
      x: Math.round(layout.screen.x + markerInset - layout.artboard.x),
      y: Math.round(
        layout.screen.y +
          layout.screen.height -
          markerInset -
          layout.artboard.y,
      ),
    },
    {
      x: Math.round(
        layout.screen.x +
          layout.screen.width -
          markerInset -
          layout.artboard.x,
      ),
      y: Math.round(
        layout.screen.y +
          layout.screen.height -
          markerInset -
          layout.artboard.y,
      ),
    },
    {
      x: Math.round(
        layout.screen.x + layout.screen.width / 2 - layout.artboard.x,
      ),
      y: Math.round(
        layout.screen.y + layout.screen.height / 2 - layout.artboard.y,
      ),
    },
  ];
}

function compositionViewportCornerSamplePoints(
  settings: CaptureSettings,
): Array<{ x: number; y: number }> {
  const { artboard, screen } = calculateCompositionLayout(settings);
  const left = Math.ceil(screen.x - artboard.x);
  const top = Math.ceil(screen.y - artboard.y);
  const right = Math.ceil(screen.x + screen.width - artboard.x) - 1;
  const bottom = Math.ceil(screen.y + screen.height - artboard.y) - 1;
  const inset = 4;
  return [
    { x: left, y: top },
    { x: left + inset, y: top + inset },
    { x: right, y: top },
    { x: right - inset, y: top + inset },
    { x: left, y: bottom },
    { x: left + inset, y: bottom - inset },
    { x: right, y: bottom },
    { x: right - inset, y: bottom - inset },
  ];
}

function expectPixelDifferent(
  actual: number[],
  expected: readonly [number, number, number, number],
): void {
  expect(actual).toHaveLength(4);
  expect(
    Math.max(
      ...expected
        .slice(0, 3)
        .map((channel, index) =>
          Math.abs((actual[index] ?? -255) - channel),
        ),
    ),
  ).toBeGreaterThan(24);
}

function compositionTabletBezelSamplePoint(
  settings: CaptureSettings,
): { x: number; y: number } {
  const layout = calculateCompositionLayout(settings);
  return {
    x: Math.round(
      layout.frame.x + layout.frame.width * 0.25 - layout.artboard.x,
    ),
    y: Math.round(
      layout.frame.y + layout.tabletBezel.top / 2 - layout.artboard.y,
    ),
  };
}

function artboardEdgeSamplePoints(
  settings: CaptureSettings,
): Array<{ x: number; y: number }> {
  const { width, height } = calculateCompositionLayout(settings).artboard;
  return [
    { x: 0, y: Math.floor(height / 2) },
    { x: width - 1, y: Math.floor(height / 2) },
    { x: Math.floor(width / 2), y: 0 },
    { x: Math.floor(width / 2), y: height - 1 },
  ];
}

async function waitForDevToolsEndpoint(
  child: ChildProcess,
  readOutput: () => string,
): Promise<string> {
  logE2e('Waiting for the browser DevTools endpoint.');
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const match = readOutput().match(
      /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/,
    );
    if (match?.[1]) {
      logE2e('Browser DevTools endpoint detected.');
      return match[1];
    }
    if (childProcessStopped(child)) {
      throw new Error(
        `FrameShot exited before DevTools became ready (${childProcessResult(child)}).\n${readOutput()}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for FrameShot DevTools.\n${readOutput()}`);
}

async function waitForMainPageEndpoint(
  browserEndpoint: string,
): Promise<string> {
  logE2e('Waiting for the main page DevTools endpoint.');
  const browserUrl = new URL(browserEndpoint);
  const listUrl = `http://${browserUrl.host}/json/list`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const targets = (await fetch(listUrl)
      .then((response) => response.json())
      .catch(() => [])) as Array<{
      url?: string;
      webSocketDebuggerUrl?: string;
    }>;
    const mainTarget = targets.find((target) =>
      target.url?.startsWith('frameshot-app://app/'),
    );
    if (mainTarget?.webSocketDebuggerUrl) {
      logE2e('Main page DevTools endpoint detected.');
      return mainTarget.webSocketDebuggerUrl;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('FrameShotの操作画面がDevToolsへ公開されませんでした。');
}

async function waitForTargetPageEndpoint(
  browserEndpoint: string,
  targetUrl: string,
): Promise<string> {
  logE2e('Waiting for the target page DevTools endpoint.');
  const browserUrl = new URL(browserEndpoint);
  const targetOrigin = new URL(targetUrl).origin;
  const listUrl = `http://${browserUrl.host}/json/list`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const targets = (await fetch(listUrl)
      .then((response) => response.json())
      .catch(() => [])) as Array<{
      url?: string;
      webSocketDebuggerUrl?: string;
    }>;
    const target = targets.find((candidate) => {
      if (!candidate.url) return false;
      try {
        return new URL(candidate.url).origin === targetOrigin;
      } catch {
        return false;
      }
    });
    if (target?.webSocketDebuggerUrl) {
      logE2e('Target page DevTools endpoint detected.');
      return target.webSocketDebuggerUrl;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('撮影対象ページがDevToolsへ公開されませんでした。');
}

function childProcessStopped(child: ChildProcess): boolean {
  return (
    child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null
  );
}

function childProcessResult(child: ChildProcess): string {
  if (child.exitCode !== null) return `exit code ${child.exitCode}`;
  if (child.signalCode !== null) return `signal ${child.signalCode}`;
  return 'unknown status';
}

function observeChildProcessClose(
  child: ChildProcess,
): Promise<ChildProcessCloseResult> {
  return new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

async function launchPackagedApp(tempDirectory: string): Promise<RunningApp> {
  const executable = packagedExecutable();
  logE2e(
    `Spawning the packaged Electron application in ${
      HEADLESS_E2E ? 'headless' : 'headed'
    } mode.`,
  );
  let processOutput = '';
  const headlessArguments = HEADLESS_E2E
    ? [
        '--frameshot-e2e-headless',
        '--headless',
        '--disable-gpu',
        '--use-angle=swiftshader',
        '--force-device-scale-factor=1',
        ...(process.platform === 'linux'
          ? ['--ozone-platform=headless']
          : []),
      ]
    : [];
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    TMPDIR: tempDirectory,
    TEMP: tempDirectory,
    TMP: tempDirectory,
  };
  if (HEADLESS_E2E && process.platform === 'linux') {
    delete childEnvironment.DISPLAY;
    delete childEnvironment.WAYLAND_DISPLAY;
  }
  if (HEADLESS_E2E) {
    childEnvironment.FRAMESHOT_E2E_HEADLESS = '1';
  }
  const child = spawn(
    executable,
    [
      ...headlessArguments,
      '--remote-debugging-port=0',
      '--enable-logging=stderr',
      `--user-data-dir=${path.join(tempDirectory, 'user-data')}`,
    ],
    {
      cwd: path.resolve('.'),
      env: childEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const closed = observeChildProcessClose(child);
  const spawned = waitForChildProcessSpawn(child);
  child.stdout?.on('data', (chunk) => {
    processOutput += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    processOutput += String(chunk);
  });
  child.on('error', (error) => {
    processOutput += `Electron process error: ${error.message}\n`;
  });

  const output = () => processOutput;
  try {
    await spawned;
    logE2e(
      `Packaged Electron process spawned (pid ${child.pid ?? 'unknown'}).`,
    );
    const browserEndpoint = await waitForDevToolsEndpoint(child, output);
    const pageEndpoint = await waitForMainPageEndpoint(browserEndpoint);
    const cdp = await CdpPage.connect(pageEndpoint);
    if (HEADLESS_E2E) {
      await expect
        .poll(
          () =>
            output().includes(
              'FrameShot E2E headless mode: using deterministic file exports.',
            ),
          { timeout: 10_000 },
        )
        .toBe(true);
    }
    logE2e('Packaged Electron application launch completed.');
    return { browserEndpoint, cdp, child, closed, output };
  } catch (error) {
    logE2e(
      'Packaged Electron application launch failed; dumping output before shutdown.',
    );
    logElectronOutput(processOutput);
    try {
      await stopChildProcess(child);
    } catch (shutdownError) {
      throw new AggregateError(
        [error, shutdownError],
        'Packaged Electron application launch and shutdown both failed.',
      );
    }
    throw error;
  }
}

function waitForChildProcessSpawn(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSpawn = () => {
      child.off('error', onError);
      resolve();
    };
    const onError = (error: Error) => {
      child.off('spawn', onSpawn);
      reject(
        new Error(`Could not spawn the Electron process: ${error.message}`),
      );
    };

    child.once('spawn', onSpawn);
    child.once('error', onError);
  });
}

async function stopChildProcess(child: ChildProcess): Promise<void> {
  if (childProcessStopped(child)) {
    logE2e(`Electron process already stopped (${childProcessResult(child)}).`);
    return;
  }

  logE2e('Stopping the Electron process with SIGTERM.');
  const terminated = child.kill('SIGTERM');
  if (!terminated) {
    logE2e(
      'SIGTERM was not reported as delivered; checking the process state.',
    );
  }
  if (await waitForChildProcessToStop(child, 3000)) {
    logE2e(`Electron process stopped (${childProcessResult(child)}).`);
    return;
  }

  logE2e('Electron process did not stop in time; sending SIGKILL.');
  const killed = child.kill('SIGKILL');
  if (!killed) {
    logE2e(
      'SIGKILL was not reported as delivered; checking the process state.',
    );
  }
  if (!(await waitForChildProcessToStop(child, 3000))) {
    throw new Error(
      `Electron process did not stop after SIGKILL (pid ${child.pid ?? 'unknown'}).`,
    );
  }
  logE2e(`Electron process stopped (${childProcessResult(child)}).`);
}

function waitForChildProcessToStop(
  child: ChildProcess,
  timeoutMs: number,
): Promise<boolean> {
  if (childProcessStopped(child)) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (stopped: boolean) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      child.off('exit', onExit);
      child.off('error', onError);
      resolve(stopped);
    };
    const onExit = () => finish(true);
    const onError = () => finish(childProcessStopped(child));

    child.once('exit', onExit);
    child.once('error', onError);
    timer = setTimeout(() => finish(childProcessStopped(child)), timeoutMs);

    if (settled) {
      clearTimeout(timer);
    } else if (childProcessStopped(child)) {
      finish(true);
    }
  });
}

async function stopPackagedApp(app: RunningApp): Promise<void> {
  if (!childProcessStopped(app.child)) {
    logE2e('Requesting a graceful Electron shutdown through the main window.');
    try {
      await app.cdp.evaluate(`
        setTimeout(() => window.close(), 0);
        true
      `);
    } catch (error) {
      logE2e(
        `Could not request a graceful Electron shutdown: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!(await waitForChildProcessToStop(app.child, 5_000))) {
      logE2e('Graceful Electron shutdown timed out; using signal fallback.');
      app.cdp.close();
      await stopChildProcess(app.child);
      await app.closed;
      return;
    }
    logE2e(`Electron process stopped (${childProcessResult(app.child)}).`);
  }

  logE2e('Closing the page DevTools connection.');
  app.cdp.close();
  await app.closed;
}

async function cleanupScenario(
  name: string,
  app: RunningApp | null,
  fixtureServer: Server,
  tempDirectory: string,
  primaryError: unknown,
): Promise<void> {
  logE2e(`Cleaning up the ${name} scenario.`);
  const cleanupErrors: unknown[] = [];

  try {
    if (app) await stopPackagedApp(app);
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    fixtureServer.close();
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    fs.rmSync(tempDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (cleanupErrors.length === 0) {
    logE2e(`${name} scenario cleanup completed.`);
    return;
  }

  logE2e(`${name} scenario cleanup completed with errors.`);
  throw new AggregateError(
    primaryError === undefined
      ? cleanupErrors
      : [primaryError, ...cleanupErrors],
    `${name} scenario cleanup failed.`,
  );
}

async function startFixtureServer(): Promise<FixtureServer> {
  logE2e('Starting the local fixture server.');
  const failedPaths = new Set<string>();
  const requests: FixtureRequest[] = [];
  const server = createServer((request, response) => {
    const cacheControl = request.headers['cache-control'];
    const pragma = request.headers.pragma;
    requests.push({
      cacheControl: Array.isArray(cacheControl)
        ? cacheControl.join(', ')
        : (cacheControl ?? ''),
      pragma: Array.isArray(pragma) ? pragma.join(', ') : (pragma ?? ''),
      url: request.url ?? '',
    });
    const bypassesCache = /(?:^|[,\s])no-cache(?:$|[,\s])/i.test(
      `${cacheControl ?? ''},${pragma ?? ''}`,
    );
    if (failedPaths.has(request.url ?? '') && !bypassesCache) {
      request.socket.destroy();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (request.url?.startsWith('/session')) {
      response.end(`<!doctype html>
        <html><head><title>FrameShot session fixture</title></head>
        <body><main id="status"></main><script>
          const reused = document.cookie.includes('frameshotSession=active');
          document.cookie = 'frameshotSession=active; Path=/; SameSite=Lax';
          const state = reused ? 'reused' : 'fresh';
          document.querySelector('#status').textContent = state;
          document.title = 'FrameShot session — ' + state;
        </script></body></html>`);
      return;
    }
    response.end(`<!doctype html>
      <html><head><title>FrameShot fixture</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
      body{display:grid;place-items:center;font-family:system-ui;color:white;background:#111827}
      canvas{position:fixed;inset:0;width:100vw;height:100vh;z-index:0}
      main{position:relative;z-index:1;padding:64px;text-align:center}
      h1{font-size:72px;margin:0 0 16px}p{font-size:24px}
      .capture-marker{position:fixed;z-index:2;width:64px;height:64px}
      #marker-tl{left:0;top:0;background:#ff0055}
      #marker-tr{right:0;top:0;background:#00e5ff}
      #marker-bl{left:0;bottom:0;background:#ffd600}
      #marker-br{right:0;bottom:0;background:#8c52ff}
      #viewport-sentinel{position:fixed;left:50%;top:50%;z-index:3;width:48px;height:48px;
        background:#dc2626;transform:translate(-50%,-50%)}
      #viewport-size{position:fixed;right:80px;bottom:16px;z-index:2;
        padding:8px 12px;background:#020617;color:#fff;font:700 18px monospace}
      #animation-probe{position:fixed;left:80px;bottom:16px;width:1px;height:1px;
        animation:fixture-pulse 10s linear infinite alternate}
      @keyframes fixture-pulse{from{opacity:.25}to{opacity:.75}}
      @media (min-width:1856px) and (max-width:1856px) and
        (min-height:958px) and (max-height:958px){
        #viewport-sentinel{background:#16a34a}
      }
      @media (min-width:768px) and (max-width:768px) and
        (min-height:1024px) and (max-height:1024px){
        #viewport-sentinel{background:#2563eb}
      }
      </style></head><body><canvas id="webgl-output" width="1440" height="900"></canvas>
      <i id="marker-tl" class="capture-marker"></i>
      <i id="marker-tr" class="capture-marker"></i>
      <i id="marker-bl" class="capture-marker"></i>
      <i id="marker-br" class="capture-marker"></i>
      <i id="viewport-sentinel"></i>
      <i id="animation-probe"></i>
      <output id="viewport-size"></output>
      <main><h1>Capture ready</h1><p>Local WebGL2 fixture page</p></main>
      <script>
        const canvas = document.querySelector('#webgl-output');
        const viewportSize = document.querySelector('#viewport-size');
        const updateViewportSize = () => {
          viewportSize.textContent = innerWidth + ' × ' + innerHeight;
        };
        addEventListener('resize', updateViewportSize);
        updateViewportSize();
        const gl = canvas.getContext('webgl2');
        if (gl) {
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0.2, 0.8, 0.5, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          document.title = 'FrameShot fixture — WebGL2 ready';
        } else {
          document.title = 'FrameShot fixture — WebGL2 blocked';
        }
      </script></body></html>`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server failed to start.');
  }
  logE2e('Local fixture server is listening.');
  return {
    failedPaths,
    requests,
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function waitForMainUi(cdp: CdpPage): Promise<void> {
  await expect
    .poll(
      () =>
        cdp.evaluate<boolean>(
          `document.querySelector('input[aria-label="URL"]') instanceof HTMLInputElement`,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  logE2e('Main UI is ready.');
}

async function navigateFromMainUi(cdp: CdpPage, url: string): Promise<void> {
  logE2e('Submitting a fixture navigation from the main UI.');
  await cdp.evaluate(`
    (async () => {
      const input = document.querySelector('input[aria-label="URL"]');
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('URL input was not found.');
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, ${JSON.stringify(url)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      if (!(input.form instanceof HTMLFormElement)) {
        throw new Error('URL form was not found.');
      }
      input.form.requestSubmit();
    })()
  `);
  logE2e('Fixture navigation was submitted.');
}

async function waitForMainText(cdp: CdpPage, text: string): Promise<void> {
  await expect
    .poll(
      () =>
        cdp.evaluate<boolean>(
          `document.body.textContent?.includes(${JSON.stringify(text)}) === true`,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  logE2e('Fixture transition was confirmed in the main UI.');
}

async function waitForSettingsPanelToClose(cdp: CdpPage): Promise<void> {
  await expect
    .poll(
      () =>
        cdp.evaluate<boolean>(`
          (() => {
            const trigger = document.querySelector(
              'button[aria-controls="settings-panel"]',
            );
            const panel = document.querySelector('.settings-panel-slot');
            return trigger?.getAttribute('aria-expanded') === 'false' &&
              panel instanceof HTMLElement &&
              panel.getAttribute('aria-hidden') === 'true' &&
              panel.inert;
          })()
        `),
      { timeout: 5_000 },
    )
    .toBe(true);
}

interface TargetFixtureState {
  animationPlayState: string;
  height: number;
  sentinelColor: string;
  viewportText: string;
  visibilityState: DocumentVisibilityState;
  width: number;
}

interface UiRectangle {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface HeaderFeedbackGeometry {
  feedback: UiRectangle;
  header: UiRectangle;
  kind: string;
  pageSlot: UiRectangle;
}

interface HeaderViewportGeometry {
  childOverflowing: boolean;
  headerHeight: number;
  headerOverflowing: boolean;
  viewportHeight: number;
  viewportWidth: number;
  workspaceY: number;
}

interface StudioGeometry {
  artboard: UiRectangle;
  canvas: UiRectangle;
  frame: UiRectangle;
  pageSlot: UiRectangle;
  panel: UiRectangle;
  preview: UiRectangle;
  shell: UiRectangle;
  workspace: UiRectangle;
}

async function readStudioGeometry(cdp: CdpPage): Promise<StudioGeometry> {
  return cdp.evaluate<StudioGeometry>(`
    (() => {
      const rectangle = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) {
          throw new Error('Studio element was not found: ' + selector);
        }
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        artboard: rectangle('.composition-artboard'),
        canvas: rectangle('.composition-canvas'),
        frame: rectangle(
          '.composition-browser-frame, .composition-phone-frame, .composition-tablet-frame, .composition-plain-frame',
        ),
        pageSlot: rectangle('.composition-page-slot'),
        panel: rectangle('.settings-panel-slot'),
        preview: rectangle('.composition-preview-frame'),
        shell: rectangle('.canvas-shell'),
        workspace: rectangle('.workspace'),
      };
    })()
  `);
}

async function readHeaderFeedbackGeometry(
  cdp: CdpPage,
): Promise<HeaderFeedbackGeometry> {
  return cdp.evaluate<HeaderFeedbackGeometry>(`
    (() => {
      const rectangle = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) {
          throw new Error('Header feedback element was not found: ' + selector);
        }
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      const feedback = document.querySelector('.header-feedback');
      if (!(feedback instanceof HTMLElement)) {
        throw new Error('Header feedback was not found.');
      }
      return {
        feedback: rectangle('.header-feedback'),
        header: rectangle('.app-header'),
        kind: feedback.dataset.feedbackKind ?? '',
        pageSlot: rectangle('.composition-page-slot'),
      };
    })()
  `);
}

async function installHeaderFeedbackHistory(cdp: CdpPage): Promise<void> {
  await cdp.evaluate(`
    (() => {
      const feedback = document.querySelector('.header-feedback');
      const header = document.querySelector('.app-header');
      const pageSlot = document.querySelector('.composition-page-slot');
      if (
        !(feedback instanceof HTMLElement) ||
        !(header instanceof HTMLElement) ||
        !(pageSlot instanceof HTMLElement)
      ) {
        throw new Error('Header feedback history probes were not found.');
      }
      window.__frameshotFeedbackObserver?.disconnect();
      window.__frameshotFeedbackHistory = [];
      const rectangle = (element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      const record = () => {
        window.__frameshotFeedbackHistory.push({
          feedback: rectangle(feedback),
          header: rectangle(header),
          kind: feedback.dataset.feedbackKind ?? '',
          pageSlot: rectangle(pageSlot),
        });
      };
      record();
      const observer = new MutationObserver(record);
      observer.observe(feedback, {
        attributes: true,
        attributeFilter: ['data-feedback-kind'],
      });
      window.__frameshotFeedbackObserver = observer;
    })()
  `);
}

async function takeHeaderFeedbackHistory(
  cdp: CdpPage,
): Promise<HeaderFeedbackGeometry[]> {
  return cdp.evaluate<HeaderFeedbackGeometry[]>(`
    (() => {
      window.__frameshotFeedbackObserver?.disconnect();
      const history = window.__frameshotFeedbackHistory ?? [];
      delete window.__frameshotFeedbackObserver;
      delete window.__frameshotFeedbackHistory;
      return history;
    })()
  `);
}

async function readHeaderViewportGeometry(
  cdp: CdpPage,
): Promise<HeaderViewportGeometry> {
  return cdp.evaluate<HeaderViewportGeometry>(`
    (() => {
      const header = document.querySelector('.app-header');
      const workspace = document.querySelector('.workspace');
      if (!(header instanceof HTMLElement) || !(workspace instanceof HTMLElement)) {
        throw new Error('Responsive header probes were not found.');
      }
      const headerRect = header.getBoundingClientRect();
      const childOverflowing = Array.from(header.children).some((child) => {
        if (!(child instanceof HTMLElement)) return false;
        const rect = child.getBoundingClientRect();
        return rect.left < headerRect.left - 1 ||
          rect.top < headerRect.top - 1 ||
          rect.right > headerRect.right + 1 ||
          rect.bottom > headerRect.bottom + 1;
      });
      return {
        childOverflowing,
        headerHeight: headerRect.height,
        headerOverflowing:
          header.scrollWidth > header.clientWidth ||
          header.scrollHeight > header.clientHeight,
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
        workspaceY: workspace.getBoundingClientRect().y,
      };
    })()
  `);
}

function expectFeedbackInsideHeader(
  geometry: HeaderFeedbackGeometry,
  expectedKind: HeaderFeedbackGeometry['kind'],
): void {
  expect(geometry.kind).toBe(expectedKind);
  expect(geometry.feedback.x).toBeGreaterThanOrEqual(geometry.header.x);
  expect(geometry.feedback.y).toBeGreaterThanOrEqual(geometry.header.y);
  expect(
    geometry.feedback.x + geometry.feedback.width,
  ).toBeLessThanOrEqual(geometry.header.x + geometry.header.width + 1);
  expect(
    geometry.feedback.y + geometry.feedback.height,
  ).toBeLessThanOrEqual(geometry.header.y + geometry.header.height + 1);
  expect(
    geometry.feedback.y + geometry.feedback.height,
  ).toBeLessThanOrEqual(geometry.pageSlot.y);
}

async function expectHeaderAtViewport(
  cdp: CdpPage,
  width: number,
  height: number,
): Promise<void> {
  await cdp.setViewport(width, height);
  await expect
    .poll(() => readHeaderViewportGeometry(cdp), { timeout: 5_000 })
    .toMatchObject({
      viewportHeight: height,
      viewportWidth: width,
    });
  const geometry = await readHeaderViewportGeometry(cdp);
  expect(geometry.headerHeight).toBe(64);
  expect(geometry.headerOverflowing).toBe(false);
  expect(geometry.childOverflowing).toBe(false);
  expect(geometry.headerHeight).toBe(geometry.workspaceY);
}

async function expectPreviewArtboard(
  cdp: CdpPage,
  expectedFrameStyle: CaptureSettings['frameStyle'],
): Promise<void> {
  const settings = await cdp.evaluate<CaptureSettings>(`
    JSON.parse(localStorage.getItem('frameshot:settings:v4'))
  `);
  const geometry = await readStudioGeometry(cdp);
  const surface = await cdp.evaluate<{
    artboardBackground: string;
    canvasBackground: string;
    frameStyle: string;
  }>(`
    (() => {
      const canvas = document.querySelector('.composition-canvas');
      const artboard = document.querySelector('.composition-artboard');
      if (!(canvas instanceof HTMLElement) || !(artboard instanceof HTMLElement)) {
        throw new Error('The composition surfaces were not found.');
      }
      return {
        artboardBackground: getComputedStyle(artboard).backgroundImage,
        canvasBackground: getComputedStyle(canvas).backgroundColor,
        frameStyle: canvas.dataset.frameStyle ?? '',
      };
    })()
  `);
  const layout = calculateCompositionLayout(settings);
  const previewScale = geometry.canvas.width / settings.outputWidth;

  expect(surface).toMatchObject({
    canvasBackground: 'rgb(0, 0, 0)',
    frameStyle: expectedFrameStyle,
  });
  expect(surface.artboardBackground).not.toBe('none');
  expect(
    Math.abs(
      geometry.artboard.width - layout.artboard.width * previewScale,
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      geometry.artboard.height - layout.artboard.height * previewScale,
    ),
  ).toBeLessThanOrEqual(2);
  const artboardFillsCanvas =
    layout.artboard.x === 0 &&
    layout.artboard.y === 0 &&
    layout.artboard.width === settings.outputWidth &&
    layout.artboard.height === settings.outputHeight;
  expect(
    Math.abs(geometry.artboard.width - geometry.canvas.width) <= 1 &&
      Math.abs(geometry.artboard.height - geometry.canvas.height) <= 1,
  ).toBe(artboardFillsCanvas);

  const frameGaps = [
    geometry.frame.x - geometry.artboard.x,
    geometry.frame.y - geometry.artboard.y,
    geometry.artboard.x +
      geometry.artboard.width -
      geometry.frame.x -
      geometry.frame.width,
    geometry.artboard.y +
      geometry.artboard.height -
      geometry.frame.y -
      geometry.frame.height,
  ];
  for (const gap of frameGaps) {
    expect(
      Math.abs(gap - settings.margin * previewScale),
    ).toBeLessThanOrEqual(2);
  }
}

function expectRectangleToStayFixed(
  before: UiRectangle,
  after: UiRectangle,
  tolerance: number,
  label: string,
): void {
  for (const property of ['x', 'y', 'width', 'height'] as const) {
    expect(
      Math.abs(after[property] - before[property]),
      `${label}.${property} moved from ${before[property]} to ${after[property]}`,
    ).toBeLessThanOrEqual(tolerance);
  }
}

const STUDIO_COMPOSITION_TOLERANCES = [
  ['shell', 1, 'canvas-shell'],
  ['preview', 1, 'composition-preview-frame'],
  ['artboard', 2, 'composition-artboard'],
  ['canvas', 2, 'composition-canvas'],
  ['frame', 2, 'composition-frame'],
  ['pageSlot', 1, 'composition-page-slot'],
] as const satisfies ReadonlyArray<
  readonly [keyof StudioGeometry, number, string]
>;

function studioCompositionStayedFixed(
  before: StudioGeometry,
  after: StudioGeometry,
): boolean {
  return STUDIO_COMPOSITION_TOLERANCES.every(
    ([property, tolerance]) =>
      (['x', 'y', 'width', 'height'] as const).every(
        (rectangleProperty) =>
          Math.abs(
            after[property][rectangleProperty] -
              before[property][rectangleProperty],
          ) <= tolerance,
      ),
  );
}

function expectStudioCompositionToStayFixed(
  before: StudioGeometry,
  after: StudioGeometry,
): void {
  for (const [property, tolerance, label] of STUDIO_COMPOSITION_TOLERANCES) {
    expectRectangleToStayFixed(
      before[property],
      after[property],
      tolerance,
      label,
    );
  }
}

async function waitForStudioCompositionToStayFixed(
  cdp: CdpPage,
  before: StudioGeometry,
): Promise<StudioGeometry> {
  let after = await readStudioGeometry(cdp);
  await expect
    .poll(async () => {
      after = await readStudioGeometry(cdp);
      return studioCompositionStayedFixed(before, after);
    }, { timeout: 5_000 })
    .toBe(true);
  expectStudioCompositionToStayFixed(before, after);
  return after;
}

async function readTargetFixtureState(cdp: CdpPage): Promise<TargetFixtureState> {
  return cdp.evaluate<TargetFixtureState>(`
    (() => {
      const sentinel = document.querySelector('#viewport-sentinel');
      const animationProbe = document.querySelector('#animation-probe');
      const viewportSize = document.querySelector('#viewport-size');
      if (
        !(sentinel instanceof HTMLElement) ||
        !(animationProbe instanceof HTMLElement) ||
        !(viewportSize instanceof HTMLOutputElement)
      ) {
        throw new Error('The target fixture probes were not found.');
      }
      return {
        animationPlayState: getComputedStyle(animationProbe).animationPlayState,
        height: innerHeight,
        sentinelColor: getComputedStyle(sentinel).backgroundColor,
        viewportText: viewportSize.textContent ?? '',
        visibilityState: document.visibilityState,
        width: innerWidth,
      };
    })()
  `);
}

test('opens a WebGL2 page and exports the latest shared canvas', async () => {
  const fixture = await startFixtureServer();
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'frameshot-e2e-'),
  );
  let app: RunningApp | null = null;
  let targetCdp: CdpPage | null = null;
  let scenarioError: unknown;

  try {
    app = await launchPackagedApp(tempDirectory);
    const cdp = app.cdp;
    await waitForMainUi(cdp);

    const initialLayout = await cdp.evaluate<{
      actionDockExists: boolean;
      accentToken: string;
      appBackgroundToken: string;
      captionExists: boolean;
      colorScheme: string;
      controlLineToken: string;
      settingsExpanded: boolean;
      settingsFooterExists: boolean;
      settingsHidden: boolean;
      canvasHeight: number;
      canvasWidth: number;
      liveSlot: boolean;
      legacyActionsExist: boolean;
      headerHeight: number;
      headerOverflowing: boolean;
      headerY: number;
      previewHeight: number;
      previewWidth: number;
      shellHeight: number;
      shellWidth: number;
      saveTextColor: string;
      textToken: string;
      theme: string;
      workspaceY: number;
    }>(`
      (() => {
        const settingsButton = document.querySelector(
          'button[aria-controls="settings-panel"]',
        );
        const settingsSlot = document.querySelector('.settings-panel-slot');
        const header = document.querySelector('.app-header');
        const shell = document.querySelector('.canvas-shell');
        const workspace = document.querySelector('.workspace');
        const preview = document.querySelector('.composition-preview-frame');
        const canvas = document.querySelector('.composition-canvas');
        const save = document.querySelector('.toolbar-save-action');
        if (
          !(settingsButton instanceof HTMLButtonElement) ||
          !(settingsSlot instanceof HTMLElement) ||
          !(header instanceof HTMLElement) ||
          !(shell instanceof HTMLElement) ||
          !(workspace instanceof HTMLElement) ||
          !(preview instanceof HTMLElement) ||
          !(canvas instanceof HTMLElement) ||
          !(save instanceof HTMLButtonElement)
        ) {
          throw new Error('The initial studio layout is incomplete.');
        }
        const rootStyle = getComputedStyle(document.documentElement);
        const shellRect = shell.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const workspaceRect = workspace.getBoundingClientRect();
        const previewRect = preview.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const legacyLabels = new Set(['撮影', '再撮影', '再合成']);
        return {
          actionDockExists: document.querySelector('.action-dock') !== null,
          accentToken: rootStyle.getPropertyValue('--accent').trim(),
          appBackgroundToken: rootStyle.getPropertyValue('--bg-0').trim(),
          captionExists: document.querySelector('.canvas-caption') !== null,
          colorScheme: rootStyle.colorScheme,
          controlLineToken: rootStyle
            .getPropertyValue('--control-line')
            .trim(),
          settingsExpanded: settingsButton.getAttribute('aria-expanded') === 'true',
          settingsFooterExists:
            document.querySelector('.settings-footer') !== null,
          settingsHidden:
            settingsSlot.getAttribute('aria-hidden') === 'true' &&
            settingsSlot.inert,
          canvasHeight: canvasRect.height,
          canvasWidth: canvasRect.width,
          liveSlot:
            document.querySelector(
              '.composition-page-slot[data-slot-mode="live"]',
            ) !== null,
          legacyActionsExist: Array.from(
            document.querySelectorAll('button'),
          ).some((button) => legacyLabels.has(button.textContent?.trim() ?? '')),
          headerHeight: headerRect.height,
          headerOverflowing:
            header.scrollWidth > header.clientWidth ||
            header.scrollHeight > header.clientHeight,
          headerY: headerRect.y,
          previewHeight: previewRect.height,
          previewWidth: previewRect.width,
          shellHeight: shellRect.height,
          shellWidth: shellRect.width,
          saveTextColor: getComputedStyle(save).color,
          textToken: rootStyle.getPropertyValue('--text').trim(),
          theme: document.documentElement.dataset.theme ?? '',
          workspaceY: workspaceRect.y,
        };
      })()
    `);
    expect(initialLayout.actionDockExists).toBe(false);
    expect(initialLayout.settingsFooterExists).toBe(false);
    expect(initialLayout.captionExists).toBe(false);
    expect(initialLayout.settingsExpanded).toBe(false);
    expect(initialLayout.settingsHidden).toBe(true);
    expect(initialLayout.liveSlot).toBe(true);
    expect(initialLayout.legacyActionsExist).toBe(false);
    expect(initialLayout.theme).toBe('light');
    expect(initialLayout.colorScheme).toBe('light');
    expect(initialLayout.appBackgroundToken).toBe('#f3f5f9');
    expect(initialLayout.textToken).toBe('#172033');
    expect(initialLayout.accentToken).toBe('#6756d9');
    expect(initialLayout.controlLineToken).toBe('#7f899b');
    expect(initialLayout.saveTextColor).toBe('rgb(255, 255, 255)');
    expect(initialLayout.headerHeight).toBe(64);
    expect(initialLayout.headerOverflowing).toBe(false);
    expect(initialLayout.headerY + initialLayout.headerHeight).toBe(
      initialLayout.workspaceY,
    );
    expect(initialLayout.previewWidth).toBeLessThanOrEqual(
      initialLayout.shellWidth + 1,
    );
    expect(initialLayout.previewHeight).toBeLessThanOrEqual(
      initialLayout.shellHeight + 1,
    );
    expect(
      Math.min(
        Math.abs(initialLayout.shellWidth - initialLayout.previewWidth),
        Math.abs(initialLayout.shellHeight - initialLayout.previewHeight),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(initialLayout.canvasWidth - initialLayout.previewWidth),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(initialLayout.canvasHeight - initialLayout.previewHeight),
    ).toBeLessThanOrEqual(2);

    const initialStudioGeometry = await readStudioGeometry(cdp);
    const originalViewport = await cdp.evaluate<{
      height: number;
      width: number;
    }>(`({ height: innerHeight, width: innerWidth })`);
    for (const width of [1261, 1260, 1121, 1120, 1040]) {
      await expectHeaderAtViewport(cdp, width, 700);
    }
    await cdp.clearViewport();
    await expect
      .poll(() => readHeaderViewportGeometry(cdp), { timeout: 5_000 })
      .toMatchObject({
        viewportHeight: originalViewport.height,
        viewportWidth: originalViewport.width,
      });

    const closedStudioGeometry =
      await waitForStudioCompositionToStayFixed(
        cdp,
        initialStudioGeometry,
      );
    expect(
      await cdp.evaluate<string>(
        `getComputedStyle(document.querySelector('.composition-canvas')).backgroundColor`,
      ),
    ).toBe('rgb(0, 0, 0)');
    expect(
      Math.abs(
        closedStudioGeometry.artboard.width -
          closedStudioGeometry.canvas.width,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        closedStudioGeometry.artboard.height -
          closedStudioGeometry.canvas.height,
      ),
    ).toBeLessThanOrEqual(1);
    const previewScale = closedStudioGeometry.canvas.width / 1920;
    const artboardFrameGaps = [
      closedStudioGeometry.frame.x - closedStudioGeometry.artboard.x,
      closedStudioGeometry.frame.y - closedStudioGeometry.artboard.y,
      closedStudioGeometry.artboard.x +
        closedStudioGeometry.artboard.width -
        closedStudioGeometry.frame.x -
        closedStudioGeometry.frame.width,
      closedStudioGeometry.artboard.y +
        closedStudioGeometry.artboard.height -
        closedStudioGeometry.frame.y -
        closedStudioGeometry.frame.height,
    ];
    for (const gap of artboardFrameGaps) {
      expect(Math.abs(gap - 32 * previewScale)).toBeLessThanOrEqual(1);
    }
    await expectPreviewArtboard(cdp, 'browser');

    await cdp.evaluate(`
      document.querySelector('button[aria-controls="settings-panel"]')?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(
            `document.querySelector('button[aria-controls="settings-panel"]')?.getAttribute('aria-expanded') === 'true'`,
          ),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const panel = document.querySelector('.settings-panel-slot');
              return panel instanceof HTMLElement &&
                panel.getAttribute('aria-hidden') === 'false' &&
                !panel.inert &&
                getComputedStyle(panel).visibility === 'visible';
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    const openStudioGeometry =
      await waitForStudioCompositionToStayFixed(
        cdp,
        closedStudioGeometry,
      );
    expect(openStudioGeometry.panel.x).toBeGreaterThanOrEqual(
      openStudioGeometry.workspace.x,
    );
    expect(openStudioGeometry.panel.y).toBeGreaterThanOrEqual(
      openStudioGeometry.workspace.y,
    );
    expect(
      openStudioGeometry.panel.x + openStudioGeometry.panel.width,
    ).toBeLessThanOrEqual(
      openStudioGeometry.workspace.x + openStudioGeometry.workspace.width + 1,
    );
    expect(
      openStudioGeometry.panel.y + openStudioGeometry.panel.height,
    ).toBeLessThanOrEqual(
      openStudioGeometry.workspace.y + openStudioGeometry.workspace.height + 1,
    );
    expect(
      Math.min(
        openStudioGeometry.panel.x + openStudioGeometry.panel.width,
        openStudioGeometry.canvas.x + openStudioGeometry.canvas.width,
      ) -
        Math.max(
          openStudioGeometry.panel.x,
          openStudioGeometry.canvas.x,
        ),
    ).toBeGreaterThan(0);
    expect(
      Math.min(
        openStudioGeometry.panel.y + openStudioGeometry.panel.height,
        openStudioGeometry.canvas.y + openStudioGeometry.canvas.height,
      ) -
        Math.max(
          openStudioGeometry.panel.y,
          openStudioGeometry.canvas.y,
        ),
    ).toBeGreaterThan(0);
    await cdp.evaluate(`
      document.querySelector('.settings-close-button')?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(
            `document.querySelector('button[aria-controls="settings-panel"]')?.getAttribute('aria-expanded') === 'false'`,
          ),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.activeElement === document.querySelector(
              'button[aria-controls="settings-panel"]',
            )
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await waitForStudioCompositionToStayFixed(
      cdp,
      closedStudioGeometry,
    );

    await navigateFromMainUi(cdp, fixture.url);
    await waitForMainText(cdp, 'FrameShot fixture — WebGL2 ready');
    targetCdp = await CdpPage.connect(
      await waitForTargetPageEndpoint(app.browserEndpoint, fixture.url),
    );
    const targetPage = targetCdp;
    const targetStateBeforeSettings: TargetFixtureState = {
      animationPlayState: 'running',
      height: 958,
      sentinelColor: 'rgb(22, 163, 74)',
      viewportText: '1856 × 958',
      visibilityState: 'visible',
      width: 1856,
    };
    await expect
      .poll(() => readTargetFixtureState(targetPage), { timeout: 5_000 })
      .toEqual(targetStateBeforeSettings);
    logE2e('WebGL2 fixture is ready.');

    const retryablePath = '/retryable';
    fixture.failedPaths.add(retryablePath);
    fixture.requests.length = 0;
    await targetPage.evaluate(`
      (() => {
        const failingLink = document.createElement('a');
        failingLink.href = ${JSON.stringify(`${fixture.url}/retryable`)};
        failingLink.textContent = 'Retryable navigation';
        document.body.append(failingLink);
        failingLink.click();
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<string>(`
            document.querySelector('.header-feedback')?.getAttribute(
              'data-feedback-kind',
            ) ?? ''
          `),
        { timeout: 5_000 },
      )
      .toBe('navigation-error');
    expectFeedbackInsideHeader(
      await readHeaderFeedbackGeometry(cdp),
      'navigation-error',
    );
    const requestCountBeforeRetry = fixture.requests.filter(
      (request) => request.url === retryablePath,
    ).length;
    await cdp.evaluate(`
      (() => {
        const retry = document.querySelector(
          '.header-feedback-action[aria-label="キャッシュ無視で再試行"]',
        );
        if (!(retry instanceof HTMLButtonElement)) {
          throw new Error('The navigation retry action was not found.');
        }
        retry.click();
      })()
    `);
    await expect
      .poll(
        () =>
          fixture.requests.filter(
            (request) => request.url === retryablePath,
          ).length,
        { timeout: 5_000 },
      )
      .toBeGreaterThan(requestCountBeforeRetry);
    await expect
      .poll(
        () =>
          cdp.evaluate<string>(`
            document.querySelector('.header-feedback')?.getAttribute(
              'data-feedback-kind',
            ) ?? ''
          `),
        { timeout: 5_000 },
      )
      .toBe('brand');
    const retryRequest = fixture.requests
      .filter((request) => request.url === retryablePath)
      .at(-1);
    expect(
      `${retryRequest?.cacheControl ?? ''},${retryRequest?.pragma ?? ''}`,
    ).toMatch(/(?:^|[,\s])no-cache(?:$|[,\s])/i);
    await expect
      .poll(
        () => targetPage.evaluate<string>('location.pathname'),
        { timeout: 5_000 },
      )
      .toBe(retryablePath);
    await expect
      .poll(() => readTargetFixtureState(targetPage), { timeout: 5_000 })
      .toEqual(targetStateBeforeSettings);

    const loadedStudioGeometry = await readStudioGeometry(cdp);
    await cdp.evaluate(`
      document.querySelector('button[aria-controls="settings-panel"]')?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const slot = document.querySelector('.composition-page-slot');
              return slot instanceof HTMLElement &&
                slot.classList.contains('is-suspended') &&
                slot.textContent?.includes('設定を編集中') === true &&
                slot.textContent?.includes(
                  'ライブページは一時的に非表示です',
                ) === true;
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await waitForStudioCompositionToStayFixed(
      cdp,
      loadedStudioGeometry,
    );
    await cdp.evaluate(`
      document.querySelector('.settings-close-button')?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const trigger = document.querySelector(
                'button[aria-controls="settings-panel"]',
              );
              const slot = document.querySelector('.composition-page-slot');
              return trigger?.getAttribute('aria-expanded') === 'false' &&
                slot instanceof HTMLElement &&
                !slot.classList.contains('is-suspended');
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(() => readTargetFixtureState(targetPage), { timeout: 5_000 })
      .toEqual(targetStateBeforeSettings);
    await waitForStudioCompositionToStayFixed(
      cdp,
      loadedStudioGeometry,
    );

    const addressCenterDelta = await cdp.evaluate<{ x: number; y: number }>(`
      (() => {
        const bar = document.querySelector('.composition-browser-bar');
        const address = document.querySelector('.composition-address');
        if (!(bar instanceof HTMLElement) || !(address instanceof HTMLElement)) {
          throw new Error('The shared browser address was not found.');
        }
        const barRect = bar.getBoundingClientRect();
        const addressRect = address.getBoundingClientRect();
        return {
          x: Math.abs(
            barRect.left + barRect.width / 2 -
            (addressRect.left + addressRect.width / 2)
          ),
          y: Math.abs(
            barRect.top + barRect.height / 2 -
            (addressRect.top + addressRect.height / 2)
          ),
        };
      })()
    `);
    expect(addressCenterDelta.x).toBeLessThanOrEqual(1);
    expect(addressCenterDelta.y).toBeLessThanOrEqual(1);

    const exportActionsReady = await cdp.evaluate<boolean>(`
      (() => {
        const copy = document.querySelector('button[aria-label="画像をコピー"]');
        const save = document.querySelector('button[aria-label="PNGを保存"]');
        return copy instanceof HTMLButtonElement &&
          save instanceof HTMLButtonElement &&
          !copy.disabled &&
          !save.disabled;
      })()
    `);
    expect(exportActionsReady).toBe(true);

    const baselineSettings = await cdp.evaluate<Record<string, unknown>>(`
      JSON.parse(localStorage.getItem('frameshot:settings:v4'))
    `);
    await targetPage.evaluate(`
      document.body.dataset.frameshotMenuState = 'preserved'
    `);
    await cdp.evaluate(`
      document.querySelector(
        '[data-device-mode="mobile"] .viewport-menu-trigger',
      )?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="mobile"] [role="menu"]',
            ) !== null
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    const mobileMenuGeometry = await cdp.evaluate<{
      bottom: number;
      maxHeight: string;
      overflowY: string;
      viewportHeight: number;
      width: number;
    }>(`
      (() => {
        const menu = document.querySelector(
          '[data-device-mode="mobile"] .viewport-menu-list',
        );
        if (!(menu instanceof HTMLElement)) {
          throw new Error('The mobile preset menu was not found.');
        }
        const rect = menu.getBoundingClientRect();
        const style = getComputedStyle(menu);
        return {
          bottom: rect.bottom,
          maxHeight: style.maxHeight,
          overflowY: style.overflowY,
          viewportHeight: innerHeight,
          width: rect.width,
        };
      })()
    `);
    expect(mobileMenuGeometry.width).toBe(264);
    expect(mobileMenuGeometry.maxHeight).not.toBe('none');
    expect(mobileMenuGeometry.overflowY).toBe('auto');
    expect(mobileMenuGeometry.bottom).toBeLessThanOrEqual(
      mobileMenuGeometry.viewportHeight,
    );
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const slot = document.querySelector('.composition-page-slot');
              return slot instanceof HTMLElement &&
                slot.classList.contains('is-suspended') &&
                slot.textContent?.includes('サイズプリセットを選択中') === true &&
                slot.textContent?.includes(
                  'ライブページは一時的に非表示です',
                ) === true;
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(
        async () => (await readTargetFixtureState(targetPage)).visibilityState,
        { timeout: 5_000 },
      )
      .toBe('hidden');
    await cdp.evaluate(`
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="mobile"] [role="menu"]',
            ) === null &&
              document.activeElement === document.querySelector(
                '[data-device-mode="mobile"] .viewport-menu-trigger',
              ) &&
              !document.querySelector(
                '.composition-page-slot',
              )?.classList.contains('is-suspended')
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(
        async () => (await readTargetFixtureState(targetPage)).visibilityState,
        { timeout: 5_000 },
      )
      .toBe('visible');
    expect(
      await targetPage.evaluate<string>(
        `document.body.dataset.frameshotMenuState ?? ''`,
      ),
    ).toBe('preserved');

    await cdp.evaluate(`
      document.querySelector(
        '[data-device-mode="mobile"] .viewport-menu-trigger',
      )?.focus()
    `);
    await cdp.pressKey('ArrowDown');
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="mobile"] [role="menu"]',
            ) !== null &&
              document.activeElement?.getAttribute('role') ===
                'menuitemradio'
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.pressKey('Enter');
    await expect
      .poll(
        () =>
          cdp.evaluate<Record<string, boolean>>(`
            ({
              menuClosed: document.querySelector(
                '[data-device-mode="mobile"] [role="menu"]',
              ) === null,
              targetResumed: !document.querySelector(
                '.composition-page-slot',
              )?.classList.contains('is-suspended'),
              triggerFocused:
                document.activeElement === document.querySelector(
                  '[data-device-mode="mobile"] .viewport-menu-trigger',
                ),
            })
          `),
        { timeout: 5_000 },
      )
      .toEqual({
        menuClosed: true,
        targetResumed: true,
        triggerFocused: true,
      });

    await cdp.evaluate(`
      document.querySelector(
        '[data-device-mode="mobile"] .viewport-menu-trigger',
      )?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="mobile"] [role="menu"]',
            ) !== null
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '.composition-page-slot',
            )?.textContent?.includes('サイズプリセットを選択中') === true
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(
        async () => (await readTargetFixtureState(targetPage)).visibilityState,
        { timeout: 5_000 },
      )
      .toBe('hidden');
    await cdp.evaluate(`
      (() => {
        const input = document.querySelector('input[aria-label="URL"]');
        const brand = document.querySelector('.brand');
        if (!(input instanceof HTMLInputElement) || !(brand instanceof Element)) {
          throw new Error('The outside-dismiss probes were not found.');
        }
        input.focus();
        brand.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="mobile"] [role="menu"]',
            ) === null &&
              document.activeElement === document.querySelector(
                'input[aria-label="URL"]',
              )
          `),
        { timeout: 5_000 },
      )
      .toBe(true);

    await cdp.evaluate(`
      document.querySelector(
        '[data-device-mode="mobile"] .viewport-menu-trigger',
      )?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="mobile"] [role="menu"]',
            ) !== null
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      (() => {
        const preset = Array.from(
          document.querySelectorAll(
            '[data-device-mode="mobile"] [role="menuitemradio"]',
          ),
        ).find(
          (button) =>
            button.querySelector('b')?.textContent === 'Google Pixel 10',
        );
        if (!(preset instanceof HTMLButtonElement)) {
          throw new Error('The Google Pixel 10 preset was not found.');
        }
        preset.click();
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<string>(`
            document.querySelector('.header-feedback')?.getAttribute(
              'data-feedback-kind',
            ) ?? ''
          `),
        { timeout: 5_000 },
      )
      .toBe('info');
    expectFeedbackInsideHeader(
      await readHeaderFeedbackGeometry(cdp),
      'info',
    );
    await cdp.evaluate(`
      (() => {
        const dismiss = document.querySelector(
          '.header-feedback-dismiss[aria-label="閉じる"]',
        );
        if (!(dismiss instanceof HTMLButtonElement)) {
          throw new Error('The feedback dismiss action was not found.');
        }
        dismiss.click();
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<string>(`
            document.querySelector('.header-feedback')?.getAttribute(
              'data-feedback-kind',
            ) ?? ''
          `),
        { timeout: 5_000 },
      )
      .toBe('brand');
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const settings = JSON.parse(
                localStorage.getItem('frameshot:settings:v4'),
              );
              return settings.deviceMode === 'mobile' &&
                settings.viewportWidth === 360 &&
                settings.viewportHeight === 808;
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(
        async () => {
          const state = await readTargetFixtureState(targetPage);
          return {
            height: state.height,
            visibilityState: state.visibilityState,
            width: state.width,
          };
        },
        { timeout: 5_000 },
      )
      .toEqual({
        height: 808,
        visibilityState: 'visible',
        width: 360,
      });
    expect(
      await targetPage.evaluate<string>(
        `document.body.dataset.frameshotMenuState ?? ''`,
      ),
    ).toBe('preserved');
    const mobileSettings = await cdp.evaluate<Record<string, unknown>>(`
      JSON.parse(localStorage.getItem('frameshot:settings:v4'))
    `);
    expect(mobileSettings).toMatchObject({
      deviceMode: 'mobile',
      frameStyle: 'phone',
      showUrl: false,
      viewportWidth: 360,
      viewportHeight: 808,
    });
    for (const key of [
      'outputWidth',
      'outputHeight',
      'gradientFrom',
      'gradientTo',
      'margin',
    ]) {
      expect(mobileSettings[key]).toEqual(baselineSettings[key]);
    }
    expect(
      await cdp.evaluate<string>(
        `document.querySelector('.composition-canvas')?.getAttribute('data-frame-style') ?? ''`,
      ),
    ).toBe('phone');
    await expectPreviewArtboard(cdp, 'phone');

    await cdp.evaluate(`
      document.querySelector(
        '[data-device-mode="mobile"] .viewport-menu-trigger',
      )?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="mobile"] [role="menu"]',
            ) !== null
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      (() => {
        const preset = Array.from(
          document.querySelectorAll(
            '[data-device-mode="mobile"] [role="menuitemradio"]',
          ),
        ).find(
          (button) =>
            button.querySelector('b')?.textContent === 'iPad Pro 12.9″',
        );
        if (!(preset instanceof HTMLButtonElement)) {
          throw new Error('The iPad Pro viewport preset was not found.');
        }
        preset.click();
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const settings = JSON.parse(
                localStorage.getItem('frameshot:settings:v4'),
              );
              return settings.deviceMode === 'mobile' &&
                settings.frameStyle === 'tablet' &&
                settings.viewportWidth === 1024 &&
                settings.viewportHeight === 1366 &&
                document.querySelector(
                  '.composition-canvas[data-frame-style="tablet"]',
                ) !== null &&
                document.querySelector('.composition-tablet-camera') !== null &&
                document.querySelector('.composition-phone-island') === null &&
                document.querySelector('.composition-phone-home') === null;
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expectPreviewArtboard(cdp, 'tablet');

    await cdp.evaluate(`
      document.querySelector(
        '[data-device-mode="mobile"] .viewport-menu-trigger',
      )?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="mobile"] [role="menu"]',
            ) !== null
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      document.querySelector('button[aria-controls="settings-panel"]')?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(
            `document.querySelector('button[aria-controls="settings-panel"]')?.getAttribute('aria-expanded') === 'true'`,
          ),
        { timeout: 5_000 },
      )
      .toBe(true);
    expect(
      await cdp.evaluate<boolean>(`
        document.querySelector('[role="menu"]') === null
      `),
    ).toBe(true);

    await cdp.evaluate(`
      document.querySelector(
        '[data-device-mode="mobile"] .viewport-menu-trigger',
      )?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="mobile"] [role="menu"]',
            ) !== null &&
              document.querySelector(
                'button[aria-controls="settings-panel"]',
              )?.getAttribute('aria-expanded') === 'false' &&
              document.querySelector(
                '.composition-page-slot',
              )?.textContent?.includes('サイズプリセットを選択中') === true
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      document.querySelector('button[aria-controls="settings-panel"]')?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector('[role="menu"]') === null &&
              document.querySelector(
                'button[aria-controls="settings-panel"]',
              )?.getAttribute('aria-expanded') === 'true' &&
              document.querySelector(
                '.composition-page-slot',
              )?.textContent?.includes('設定を編集中') === true
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      (() => {
        const browserFrame = Array.from(
          document.querySelectorAll('.frame-selector button'),
        ).find((button) => button.textContent?.includes('Browser'));
        if (!(browserFrame instanceof HTMLButtonElement)) {
          throw new Error('The manual Browser frame control was not found.');
        }
        browserFrame.click();
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const settings = JSON.parse(
                localStorage.getItem('frameshot:settings:v4'),
              );
              return settings.frameStyle === 'browser' &&
                settings.viewportWidth === 1024 &&
                settings.viewportHeight === 1366;
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      document.querySelector('.settings-close-button')?.click()
    `);
    await waitForSettingsPanelToClose(cdp);

    await cdp.evaluate(`
      document.querySelector(
        '[data-device-mode="mobile"] .viewport-menu-trigger',
      )?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="mobile"] [role="menuitemradio"].custom',
            ) !== null
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      (() => {
        const custom = document.querySelector(
          '[data-device-mode="mobile"] [role="menuitemradio"].custom',
        );
        if (!(custom instanceof HTMLButtonElement)) {
          throw new Error('The custom viewport action was not found.');
        }
        custom.click();
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              'button[aria-controls="settings-panel"]',
            )?.getAttribute('aria-expanded') === 'true' &&
              document.activeElement?.getAttribute('aria-label') ===
                'ページ表示サイズ 幅'
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      (() => {
        const input = document.querySelector(
          'input[aria-label="ページ表示サイズ 幅"]',
        );
        if (!(input instanceof HTMLInputElement)) {
          throw new Error('The custom viewport width input was not found.');
        }
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, '414');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const settings = JSON.parse(
                localStorage.getItem('frameshot:settings:v4'),
              );
              return settings.viewportWidth === 414 &&
                settings.frameStyle === 'phone' &&
                settings.showUrl === false;
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      document.querySelector('.settings-close-button')?.click()
    `);
    await waitForSettingsPanelToClose(cdp);
    await cdp.evaluate(`
      document.querySelector(
        '[data-device-mode="desktop"] .viewport-menu-trigger',
      )?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="desktop"] [role="menu"]',
            ) !== null
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '.composition-page-slot',
            )?.textContent?.includes('サイズプリセットを選択中') === true
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(
        async () => (await readTargetFixtureState(targetPage)).visibilityState,
        { timeout: 5_000 },
      )
      .toBe('hidden');
    await cdp.evaluate(`
      (() => {
        const preset = Array.from(
          document.querySelectorAll(
            '[data-device-mode="desktop"] [role="menuitemradio"]',
          ),
        ).find((button) => button.querySelector('b')?.textContent === 'WQHD');
        if (!(preset instanceof HTMLButtonElement)) {
          throw new Error('The WQHD screenshot preset was not found.');
        }
        preset.click();
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const settings = JSON.parse(
                localStorage.getItem('frameshot:settings:v4'),
              );
              return settings.deviceMode === 'desktop' &&
                settings.outputWidth === 2560 &&
                settings.outputHeight === 1440 &&
                settings.viewportWidth === 2496 &&
                settings.viewportHeight === 1318 &&
                settings.frameStyle === 'browser' &&
                settings.margin === 32 &&
                settings.captureScale === 1 &&
                document.querySelector('.header-feedback')?.textContent?.includes(
                  '取得品質を1×へ調整しました',
                ) === true;
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      document.querySelector(
        '[data-device-mode="desktop"] .viewport-menu-trigger',
      )?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="desktop"] [role="menu"]',
            ) !== null
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      (() => {
        const preset = Array.from(
          document.querySelectorAll(
            '[data-device-mode="desktop"] [role="menuitemradio"]',
          ),
        ).find((button) => button.querySelector('b')?.textContent === 'Full HD');
        if (!(preset instanceof HTMLButtonElement)) {
          throw new Error('The Full HD screenshot preset was not found.');
        }
        preset.click();
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const settings = JSON.parse(
                localStorage.getItem('frameshot:settings:v4'),
              );
              return settings.deviceMode === 'desktop' &&
                settings.outputWidth === 1920 &&
                settings.outputHeight === 1080 &&
                settings.viewportWidth === 1856 &&
                settings.viewportHeight === 958 &&
                settings.frameStyle === 'browser' &&
                settings.margin === 32 &&
                settings.captureScale === 1 &&
                settings.showUrl === true;
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(
        async () => (await readTargetFixtureState(targetPage)).visibilityState,
        { timeout: 5_000 },
      )
      .toBe('visible');
    expect(
      await targetPage.evaluate<string>(
        `document.body.dataset.frameshotMenuState ?? ''`,
      ),
    ).toBe('preserved');

    const desktopSettings = await cdp.evaluate<CaptureSettings>(`
      JSON.parse(localStorage.getItem('frameshot:settings:v4'))
    `);
    expect(desktopSettings).toMatchObject({
      deviceMode: 'desktop',
      frameStyle: 'browser',
      showUrl: true,
      outputWidth: 1920,
      outputHeight: 1080,
      viewportWidth: 1856,
      viewportHeight: 958,
      margin: 32,
      captureScale: 1,
    });

    await cdp.evaluate(`
      document.querySelector(
        '[data-device-mode="desktop"] .viewport-menu-trigger',
      )?.click()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              '[data-device-mode="desktop"] [role="menuitemradio"].custom',
            ) !== null
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      (() => {
        const custom = document.querySelector(
          '[data-device-mode="desktop"] [role="menuitemradio"].custom',
        );
        if (!(custom instanceof HTMLButtonElement)) {
          throw new Error('The custom screenshot action was not found.');
        }
        custom.click();
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            document.querySelector(
              'button[aria-controls="settings-panel"]',
            )?.getAttribute('aria-expanded') === 'true' &&
              document.activeElement?.getAttribute('aria-label') ===
                'スクリーンショットサイズ 幅'
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      document.querySelector('.settings-close-button')?.click()
    `);
    await waitForSettingsPanelToClose(cdp);

    const exportDestination = HEADLESS_E2E ? 'file' : 'clipboard';

    if (isWslHost()) {
      const clipboardError = await cdp.evaluate<string>(`
        (async () => {
          const settings = JSON.parse(
            localStorage.getItem('frameshot:settings:v4'),
          );
          try {
            await window.frameShot.exportImage(settings, 'clipboard');
            return '';
          } catch (error) {
            return error instanceof Error ? error.message : String(error);
          }
        })()
      `);
      expect(clipboardError).toContain('WSL2/WSLg');
      expect(clipboardError).toContain('保存');
      logE2e('WSL clipboard copy was rejected with the supported fallback.');
    }

    const desktopArtboard = calculateCompositionLayout(
      desktopSettings,
    ).artboard;
    {
      const expectedDesktopPixels = [
        [255, 0, 85, 255],
        [0, 229, 255, 255],
        [255, 214, 0, 255],
        [140, 82, 255, 255],
        [22, 163, 74, 255],
      ] as const;

      for (const captureScale of [1, 2] as const) {
        const directExport = await cdp.evaluate<ExportResult>(`
          (async () => {
            const settings = JSON.parse(
              localStorage.getItem('frameshot:settings:v4'),
            );
            return window.frameShot.exportImage(
              {
                ...settings,
                captureScale: ${captureScale},
                pauseAnimations: ${JSON.stringify(!HEADLESS_E2E)},
              },
              ${JSON.stringify(exportDestination)},
            );
          })()
        `);
        expect(directExport).toMatchObject({
          destination: exportDestination,
          completed: true,
          width: desktopArtboard.width,
          height: desktopArtboard.height,
        });
        expect(directExport.exportedAt).toEqual(expect.any(String));

        const probe = await exportedPng(
          tempDirectory,
          `capture-${captureScale}x`,
          directExport,
        );
        expect(probe).toMatchObject({
          width: desktopArtboard.width,
          height: desktopArtboard.height,
        });
        const markerPixels = await samplePngPixels(
          cdp,
          probe.pngPath,
          compositionViewportSamplePoints(desktopSettings),
        );
        for (const [index, expectedPixel] of expectedDesktopPixels.entries()) {
          expectPixelNear(markerPixels[index] ?? [], expectedPixel);
        }
        const cornerPixels = await samplePngPixels(
          cdp,
          probe.pngPath,
          compositionViewportCornerSamplePoints(desktopSettings),
        );
        for (const [index, expectedPixel] of expectedDesktopPixels
          .slice(0, 4)
          .entries()) {
          expectPixelDifferent(
            cornerPixels[index * 2] ?? [],
            expectedPixel,
          );
          expectPixelNear(
            cornerPixels[index * 2 + 1] ?? [],
            expectedPixel,
          );
        }
        const edgePixels = await samplePngPixels(
          cdp,
          probe.pngPath,
          artboardEdgeSamplePoints(desktopSettings),
        );
        for (const edgePixel of edgePixels) {
          expectPixelDifferent(edgePixel, [0, 0, 0, 255]);
        }
        await expect
          .poll(
            async () =>
              (await readTargetFixtureState(targetPage))
                .animationPlayState,
            { timeout: 5_000 },
          )
          .toBe('running');
        expect(await readTargetFixtureState(targetPage)).toEqual({
          animationPlayState: 'running',
          height: 958,
          sentinelColor: 'rgb(22, 163, 74)',
          viewportText: '1856 × 958',
          visibilityState: 'visible',
          width: 1856,
        });
      }

      const ipadSettings: CaptureSettings = {
        ...desktopSettings,
        captureScale: 2,
        deviceMode: 'mobile',
        frameStyle: 'tablet',
        pauseAnimations: !HEADLESS_E2E,
        showUrl: false,
        viewportHeight: 1024,
        viewportWidth: 768,
      };
      const ipadExport = await cdp.evaluate<ExportResult>(`
        window.frameShot.exportImage(
          ${JSON.stringify(ipadSettings)},
          ${JSON.stringify(exportDestination)},
        )
      `);
      const ipadArtboard = calculateCompositionLayout(ipadSettings).artboard;
      expect(ipadExport).toMatchObject({
        destination: exportDestination,
        completed: true,
        width: ipadArtboard.width,
        height: ipadArtboard.height,
      });
      const ipadProbe = await exportedPng(
        tempDirectory,
        'capture-ipad-tablet',
        ipadExport,
      );
      expect(ipadProbe).toMatchObject({
        width: ipadArtboard.width,
        height: ipadArtboard.height,
      });
      const ipadPixels = await samplePngPixels(
        cdp,
        ipadProbe.pngPath,
        [
          ...compositionViewportSamplePoints(ipadSettings),
          compositionTabletBezelSamplePoint(ipadSettings),
        ],
      );
      const expectedIpadPixels = [
        [255, 0, 85, 255],
        [0, 229, 255, 255],
        [255, 214, 0, 255],
        [140, 82, 255, 255],
        [37, 99, 235, 255],
      ] as const;
      for (const [index, expectedPixel] of expectedIpadPixels.entries()) {
        expectPixelNear(ipadPixels[index] ?? [], expectedPixel);
      }
      const tabletBezelPixel = ipadPixels[5] ?? [];
      expect(tabletBezelPixel).toHaveLength(4);
      expect(Math.max(...tabletBezelPixel.slice(0, 3))).toBeLessThan(90);
      expect(tabletBezelPixel[3]).toBe(255);
      const ipadEdgePixels = await samplePngPixels(
        cdp,
        ipadProbe.pngPath,
        artboardEdgeSamplePoints(ipadSettings),
      );
      for (const edgePixel of ipadEdgePixels) {
        expectPixelDifferent(edgePixel, [0, 0, 0, 255]);
      }
      await expect
        .poll(
          async () =>
            (await readTargetFixtureState(targetPage))
              .animationPlayState,
          { timeout: 5_000 },
        )
        .toBe('running');
      expect(await readTargetFixtureState(targetPage)).toEqual({
        animationPlayState: 'running',
        height: 958,
        sentinelColor: 'rgb(22, 163, 74)',
        viewportText: '1856 × 958',
        visibilityState: 'visible',
        width: 1856,
      });
      logE2e(
        'The 1x, 2x, and iPad exports preserved the requested logical viewports and Tablet frame.',
      );
    }

    await cdp.evaluate(`
      (() => {
        document.querySelector(
          'button[aria-controls="settings-panel"]',
        )?.click();
        const preset = document.querySelector(
          '.gradient-swatch[title="Sea Glass Flow"]',
        );
        if (!(preset instanceof HTMLButtonElement)) {
          throw new Error('The Sea Glass Flow preset was not found.');
        }
        preset.click();
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const artboard = document.querySelector('.composition-artboard');
              const glow = document.querySelector('.composition-glow');
              const preset = document.querySelector(
                '.gradient-swatch[title="Sea Glass Flow"]',
              );
              const settings = JSON.parse(
                localStorage.getItem('frameshot:settings:v4'),
              );
              return artboard instanceof HTMLElement &&
                glow instanceof HTMLElement &&
                preset instanceof HTMLButtonElement &&
                settings.gradientFrom === '#d9f2ec' &&
                settings.gradientTo === '#dce7fb' &&
                settings.gradientAngle === 128 &&
                settings.backgroundStyle === 'fluid' &&
                artboard.classList.contains('background-fluid') &&
                preset.classList.contains('background-fluid') &&
                preset.classList.contains('active') &&
                document.querySelectorAll('.gradient-swatch.active').length === 1 &&
                (getComputedStyle(artboard).backgroundImage.match(
                  /gradient\\(/g,
                )?.length ?? 0) >= 5 &&
                getComputedStyle(glow).opacity === '0.28';
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    const headlessUiExportPath = path.join(
      tempDirectory,
      'user-data',
      'e2e-export.png',
    );
    if (HEADLESS_E2E) {
      fs.rmSync(headlessUiExportPath, { force: true });
    }
    await installHeaderFeedbackHistory(cdp);
    await cdp.evaluate(`
      document.querySelector('.settings-close-button')?.click();
      document.querySelector(
        'button[aria-label=${JSON.stringify(
          HEADLESS_E2E ? 'PNGを保存' : '画像をコピー',
        )}]',
      )?.click();
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<string>(
            `document.querySelector(
              '.header-feedback:not([data-feedback-kind="brand"])',
            )?.textContent ?? ''`,
          ),
        { timeout: 30_000 },
      )
      .toContain(
        HEADLESS_E2E
          ? 'PNGを保存しました:'
          : isWslHost()
          ? 'WSL2/WSLg'
          : `${desktopArtboard.width} × ${desktopArtboard.height} の画像をコピーしました。`,
      );
    const completedFeedback = await readHeaderFeedbackGeometry(cdp);
    expectFeedbackInsideHeader(
      completedFeedback,
      HEADLESS_E2E || !isWslHost() ? 'success' : 'error',
    );
    const feedbackHistory = await takeHeaderFeedbackHistory(cdp);
    const busyFeedback = feedbackHistory.find(
      (feedback) => feedback.kind === 'busy',
    );
    if (!busyFeedback) {
      throw new Error('The export did not expose busy header feedback.');
    }
    expectFeedbackInsideHeader(busyFeedback, 'busy');
    if (HEADLESS_E2E) {
      expect(readPngDimensions(headlessUiExportPath)).toEqual({
        width: desktopArtboard.width,
        height: desktopArtboard.height,
      });
    }
    expect(
      await cdp.evaluate<boolean>(`
        (() => {
          const legacyLabels = new Set(['撮影', '再撮影', '再合成']);
          return Array.from(document.querySelectorAll('button')).some(
            (button) => legacyLabels.has(button.textContent?.trim() ?? ''),
          );
        })()
      `),
    ).toBe(false);
    logE2e(
      `${
        HEADLESS_E2E ? 'Save' : 'Copy'
      } generated a fresh export without a capture mode.`,
    );

    const leakedFiles = fs
      .readdirSync(tempDirectory)
      .filter((name) => name.startsWith('frameshot-export-'));
    expect(leakedFiles).toEqual([]);
  } catch (error) {
    scenarioError = error;
    if (app) {
      logElectronOutput(app.output());
    }
    throw error;
  } finally {
    targetCdp?.close();
    await cleanupScenario(
      'WebGL2 shared export',
      app,
      fixture.server,
      tempDirectory,
      scenarioError,
    );
  }
});

test('keeps target cookies only for the current app process', async () => {
  const fixture = await startFixtureServer();
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'frameshot-session-e2e-'),
  );
  const sessionUrl = new URL('/session', fixture.url).href;
  let app: RunningApp | null = null;
  let scenarioError: unknown;

  try {
    app = await launchPackagedApp(tempDirectory);
    await waitForMainUi(app.cdp);
    await navigateFromMainUi(app.cdp, `${sessionUrl}?visit=first`);
    await waitForMainText(app.cdp, 'FrameShot session — fresh');
    logE2e('Fresh session state was confirmed for the first visit.');
    await navigateFromMainUi(app.cdp, `${sessionUrl}?visit=second`);
    await waitForMainText(app.cdp, 'FrameShot session — reused');
    logE2e('Reused session state was confirmed within the current process.');

    await app.cdp.evaluate(`
      localStorage.setItem('frameshot:settings-panel-open', 'true');
      document.querySelector('button[aria-controls="settings-panel"]')?.click();
    `);
    await expect
      .poll(
        () =>
          app?.cdp.evaluate<boolean>(
            `document.querySelector('button[aria-controls="settings-panel"]')?.getAttribute('aria-expanded') === 'true'`,
          ) ?? false,
        { timeout: 5_000 },
      )
      .toBe(true);

    logE2e('Stopping the first session process before restart.');
    await stopPackagedApp(app);
    app = null;

    logE2e('Restarting the packaged application for session isolation.');
    app = await launchPackagedApp(tempDirectory);
    await waitForMainUi(app.cdp);
    logE2e('Packaged application restart completed.');
    expect(
      await app.cdp.evaluate<boolean>(
        `(() => {
          const trigger = document.querySelector(
            'button[aria-controls="settings-panel"]',
          );
          const panel = document.querySelector('.settings-panel-slot');
          return localStorage.getItem('frameshot:settings-panel-open') === 'true' &&
            trigger?.getAttribute('aria-expanded') === 'false' &&
            panel instanceof HTMLElement &&
            panel.getAttribute('aria-hidden') === 'true' &&
            panel.inert;
        })()`,
      ),
    ).toBe(true);
    await navigateFromMainUi(app.cdp, `${sessionUrl}?visit=restart`);
    await waitForMainText(app.cdp, 'FrameShot session — fresh');
    logE2e('Fresh session state was confirmed after restart.');
  } catch (error) {
    scenarioError = error;
    if (app) {
      logElectronOutput(app.output());
    }
    throw error;
  } finally {
    await cleanupScenario(
      'session isolation',
      app,
      fixture.server,
      tempDirectory,
      scenarioError,
    );
  }
});

test('closes the application window without main process errors', async () => {
  const fixture = await startFixtureServer();
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'frameshot-close-e2e-'),
  );
  let app: RunningApp | null = null;
  let targetCdp: CdpPage | null = null;
  let scenarioError: unknown;

  try {
    app = await launchPackagedApp(tempDirectory);
    await waitForMainUi(app.cdp);
    await navigateFromMainUi(app.cdp, fixture.url);
    await waitForMainText(app.cdp, 'FrameShot fixture — WebGL2 ready');
    targetCdp = await CdpPage.connect(
      await waitForTargetPageEndpoint(app.browserEndpoint, fixture.url),
    );

    await app.cdp.evaluate(`
      (() => {
        const settings = {
          ...JSON.parse(localStorage.getItem('frameshot:settings:v4')),
          captureScale: 2,
          pauseAnimations: true,
          waitMs: 5000,
        };
        void window.frameShot
          .exportImage(
            settings,
            ${JSON.stringify(HEADLESS_E2E ? 'file' : 'clipboard')},
          )
          .catch(() => undefined);
        return true;
      })()
    `);
    await expect
      .poll(
        async () =>
          targetCdp
            ? (await readTargetFixtureState(targetCdp)).animationPlayState
            : '',
        { timeout: 10_000 },
      )
      .toBe('paused');
    await app.cdp.evaluate(`
      setTimeout(() => window.close(), 0);
      true
    `);

    await expect
      .poll(() => app ? childProcessStopped(app.child) : false, {
        timeout: 10_000,
      })
      .toBe(true);
    const closeResult = await app.closed;
    expect(closeResult.code).toBe(0);
    expect(closeResult.signal).toBeNull();
    expect(app.output()).not.toMatch(
      /Object has been destroyed|Uncaught exception|A JavaScript error occurred/i,
    );
    logE2e(
      'Window close during an active capture completed without a main process exception.',
    );
  } catch (error) {
    scenarioError = error;
    if (app) {
      logElectronOutput(app.output());
    }
    throw error;
  } finally {
    targetCdp?.close();
    await cleanupScenario(
      'window close',
      app,
      fixture.server,
      tempDirectory,
      scenarioError,
    );
  }
});
