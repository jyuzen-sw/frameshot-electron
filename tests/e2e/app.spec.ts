import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { expect, test } from '@playwright/test';
import type { ExportResult } from '../../src/shared/types';

interface RunningApp {
  cdp: CdpPage;
  child: ChildProcess;
  output: () => string;
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

async function launchPackagedApp(tempDirectory: string): Promise<RunningApp> {
  const executable = packagedExecutable();
  logE2e('Spawning the packaged Electron application.');
  let processOutput = '';
  const child = spawn(
    executable,
    [
      '--remote-debugging-port=0',
      '--enable-logging=stderr',
      `--user-data-dir=${path.join(tempDirectory, 'user-data')}`,
    ],
    {
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        TMPDIR: tempDirectory,
        TEMP: tempDirectory,
        TMP: tempDirectory,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
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
    logE2e('Packaged Electron application launch completed.');
    return { cdp, child, output };
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
  logE2e('Closing the page DevTools connection.');
  app.cdp.close();
  await stopChildProcess(app.child);
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
    fs.rmSync(tempDirectory, { recursive: true, force: true });
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

async function startFixtureServer(): Promise<{ server: Server; url: string }> {
  logE2e('Starting the local fixture server.');
  const server = createServer((request, response) => {
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
      <html><head><title>FrameShot fixture</title><style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
      body{display:grid;place-items:center;font-family:system-ui;color:white;background:#111827}
      canvas{position:fixed;inset:0;width:100vw;height:100vh;z-index:0}
      main{position:relative;z-index:1;padding:64px;text-align:center}
      h1{font-size:72px;margin:0 0 16px}p{font-size:24px}
      </style></head><body><canvas id="webgl-output" width="1440" height="900"></canvas>
      <main><h1>Capture ready</h1><p>Local WebGL2 fixture page</p></main>
      <script>
        const canvas = document.querySelector('#webgl-output');
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
  return { server, url: `http://127.0.0.1:${address.port}` };
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

test('opens a WebGL2 page and exports the latest shared canvas', async () => {
  const fixture = await startFixtureServer();
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'frameshot-e2e-'),
  );
  let app: RunningApp | null = null;
  let scenarioError: unknown;

  try {
    app = await launchPackagedApp(tempDirectory);
    const cdp = app.cdp;
    await waitForMainUi(cdp);

    const initialLayout = await cdp.evaluate<{
      actionDockExists: boolean;
      captionExists: boolean;
      settingsExpanded: boolean;
      settingsFooterExists: boolean;
      settingsHidden: boolean;
      canvasHeight: number;
      canvasWidth: number;
      liveSlot: boolean;
      legacyActionsExist: boolean;
      previewHeight: number;
      previewWidth: number;
      shellHeight: number;
      shellWidth: number;
    }>(`
      (() => {
        const settingsButton = document.querySelector(
          'button[aria-controls="settings-panel"]',
        );
        const settingsSlot = document.querySelector('.settings-panel-slot');
        const shell = document.querySelector('.canvas-shell');
        const preview = document.querySelector('.composition-preview-frame');
        const canvas = document.querySelector('.composition-canvas');
        if (
          !(settingsButton instanceof HTMLButtonElement) ||
          !(settingsSlot instanceof HTMLElement) ||
          !(shell instanceof HTMLElement) ||
          !(preview instanceof HTMLElement) ||
          !(canvas instanceof HTMLElement)
        ) {
          throw new Error('The initial studio layout is incomplete.');
        }
        const shellRect = shell.getBoundingClientRect();
        const previewRect = preview.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        const legacyLabels = new Set(['撮影', '再撮影', '再合成']);
        return {
          actionDockExists: document.querySelector('.action-dock') !== null,
          captionExists: document.querySelector('.canvas-caption') !== null,
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
          previewHeight: previewRect.height,
          previewWidth: previewRect.width,
          shellHeight: shellRect.height,
          shellWidth: shellRect.width,
        };
      })()
    `);
    expect(initialLayout.actionDockExists).toBe(false);
    expect(initialLayout.settingsFooterExists).toBe(false);
    expect(initialLayout.captionExists).toBe(true);
    expect(initialLayout.settingsExpanded).toBe(false);
    expect(initialLayout.settingsHidden).toBe(true);
    expect(initialLayout.liveSlot).toBe(true);
    expect(initialLayout.legacyActionsExist).toBe(false);
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
          cdp.evaluate<number>(
            `document.querySelector('.composition-preview-frame')?.getBoundingClientRect().width ?? 0`,
          ),
        { timeout: 5_000 },
      )
      .toBeLessThan(initialLayout.previewWidth);
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

    await navigateFromMainUi(cdp, fixture.url);
    await waitForMainText(cdp, 'FrameShot fixture — WebGL2 ready');
    logE2e('WebGL2 fixture is ready.');

    const addressCenterDelta = await cdp.evaluate<number>(`
      (() => {
        const bar = document.querySelector('.composition-browser-bar');
        const address = document.querySelector('.composition-address');
        if (!(bar instanceof HTMLElement) || !(address instanceof HTMLElement)) {
          throw new Error('The shared browser address was not found.');
        }
        const barRect = bar.getBoundingClientRect();
        const addressRect = address.getBoundingClientRect();
        return Math.abs(
          barRect.top + barRect.height / 2 -
          (addressRect.top + addressRect.height / 2)
        );
      })()
    `);
    expect(addressCenterDelta).toBeLessThanOrEqual(1);

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
      JSON.parse(localStorage.getItem('frameshot:settings:v2'))
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
    await cdp.evaluate(`
      (() => {
        const preset = Array.from(
          document.querySelectorAll(
            '[data-device-mode="mobile"] [role="menuitem"]',
          ),
        ).find((button) => button.querySelector('b')?.textContent === 'Android');
        if (!(preset instanceof HTMLButtonElement)) {
          throw new Error('The Android viewport preset was not found.');
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
                localStorage.getItem('frameshot:settings:v2'),
              );
              return settings.deviceMode === 'mobile' &&
                settings.viewportWidth === 412 &&
                settings.viewportHeight === 915;
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    const mobileSettings = await cdp.evaluate<Record<string, unknown>>(`
      JSON.parse(localStorage.getItem('frameshot:settings:v2'))
    `);
    for (const key of [
      'outputWidth',
      'outputHeight',
      'frameStyle',
      'gradientFrom',
      'gradientTo',
      'margin',
    ]) {
      expect(mobileSettings[key]).toEqual(baselineSettings[key]);
    }

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
              '[data-device-mode="mobile"] [role="menuitem"].custom',
            ) !== null
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      (() => {
        const custom = document.querySelector(
          '[data-device-mode="mobile"] [role="menuitem"].custom',
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
                'ページ表示領域 幅'
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      (() => {
        const input = document.querySelector(
          'input[aria-label="ページ表示領域 幅"]',
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
          cdp.evaluate<boolean>(
            `JSON.parse(localStorage.getItem('frameshot:settings:v2')).viewportWidth === 414`,
          ),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      document.querySelector('.settings-close-button')?.click()
    `);
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
            '[data-device-mode="desktop"] [role="menuitem"]',
          ),
        ).find((button) => button.querySelector('b')?.textContent === 'Desktop');
        if (!(preset instanceof HTMLButtonElement)) {
          throw new Error('The default desktop viewport preset was not found.');
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
                localStorage.getItem('frameshot:settings:v2'),
              );
              return settings.deviceMode === 'desktop' &&
                settings.viewportWidth === 1440 &&
                settings.viewportHeight === 900;
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);

    const directExport = await cdp.evaluate<ExportResult>(`
      (async () => {
        const settings = JSON.parse(
          localStorage.getItem('frameshot:settings:v2'),
        );
        return window.frameShot.exportImage(settings, 'clipboard');
      })()
    `);
    expect(directExport).toMatchObject({
      destination: 'clipboard',
      completed: true,
      width: 1920,
      height: 1080,
    });
    expect(directExport.exportedAt).toEqual(expect.any(String));
    logE2e('The shared export renderer completed an exact-size export.');

    await cdp.evaluate(`
      (() => {
        document.querySelector('.toast-notice button[aria-label="閉じる"]')
          ?.click();
        document.querySelector(
          'button[aria-controls="settings-panel"]',
        )?.click();
        const input = document.querySelector(
          'input[aria-label="背景色 カラー1"]',
        );
        if (!(input instanceof HTMLInputElement)) {
          throw new Error('The background color input was not found.');
        }
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, '#d7eadf');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const canvas = document.querySelector('.composition-canvas');
              const glow = document.querySelector('.composition-glow');
              const settings = JSON.parse(
                localStorage.getItem('frameshot:settings:v2'),
              );
              return canvas instanceof HTMLElement &&
                glow instanceof HTMLElement &&
                settings.gradientFrom === '#d7eadf' &&
                getComputedStyle(canvas).backgroundImage.includes(
                  'rgb(215, 234, 223)',
                ) &&
                getComputedStyle(glow).opacity === '0.62';
            })()
          `),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      document.querySelector('.settings-close-button')?.click();
      document.querySelector('button[aria-label="画像をコピー"]')?.click();
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(
            `document.querySelector('.busy-indicator') !== null`,
          ),
        { timeout: 5_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () =>
          cdp.evaluate<string>(
            `document.querySelector('.toast-notice.success')?.textContent ?? ''`,
          ),
        { timeout: 30_000 },
      )
      .toContain('1920 × 1080 の画像をコピーしました。');
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
    logE2e('Copy generated a fresh export without a capture mode.');

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
      document.querySelector('button[aria-controls="settings-panel"]')?.click()
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
        `document.querySelector('button[aria-controls="settings-panel"]')?.getAttribute('aria-expanded') === 'true'`,
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
