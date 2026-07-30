import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { expect, test } from '@playwright/test';
import { calculateCompositionLayout } from '../../src/shared/layout';
import { DEFAULT_SETTINGS } from '../../src/shared/presets';

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

class CdpPage {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (response: CdpResponse) => void;
      reject: (error: Error) => void;
    }
  >();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpResponse;
      if (message.id === undefined) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) {
        request.reject(
          new Error(message.error.message ?? 'DevTools command failed.'),
        );
      } else {
        request.resolve(message);
      }
    });
    socket.addEventListener('close', () => {
      for (const request of this.pending.values()) {
        request.reject(new Error('DevTools connection closed.'));
      }
      this.pending.clear();
    });
  }

  public static async connect(endpoint: string): Promise<CdpPage> {
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
  ): Promise<CdpResponse> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

function packagedExecutable(): string {
  const outDirectory = path.resolve('out');
  const suffix = `-${process.platform}-${process.arch}`;
  const packageDirectory = fs
    .readdirSync(outDirectory, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.endsWith(suffix));

  if (!packageDirectory) {
    throw new Error(`Packaged application was not found in ${outDirectory}.`);
  }

  const base = path.join(outDirectory, packageDirectory.name);
  if (process.platform === 'win32') return path.join(base, 'frameshot.exe');
  if (process.platform === 'darwin') {
    const appBundle = fs
      .readdirSync(base, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && entry.name.endsWith('.app'));
    if (!appBundle) throw new Error('macOS app bundle was not found.');
    return path.join(base, appBundle.name, 'Contents', 'MacOS', 'frameshot');
  }
  return path.join(base, 'frameshot');
}

async function waitForDevToolsEndpoint(
  child: ChildProcess,
  readOutput: () => string,
): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const match = readOutput().match(
      /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/,
    );
    if (match?.[1]) return match[1];
    if (child.exitCode !== null) {
      throw new Error(
        `FrameShot exited before DevTools became ready (${child.exitCode}).\n${readOutput()}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for FrameShot DevTools.\n${readOutput()}`);
}

async function waitForMainPageEndpoint(
  browserEndpoint: string,
): Promise<string> {
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
      return mainTarget.webSocketDebuggerUrl;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('FrameShotの操作画面がDevToolsへ公開されませんでした。');
}

async function launchPackagedApp(tempDirectory: string): Promise<RunningApp> {
  const child = spawn(
    packagedExecutable(),
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
  let processOutput = '';
  child.stdout?.on('data', (chunk) => {
    processOutput += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    processOutput += String(chunk);
  });

  const output = () => processOutput;
  try {
    const browserEndpoint = await waitForDevToolsEndpoint(child, output);
    const pageEndpoint = await waitForMainPageEndpoint(browserEndpoint);
    const cdp = await CdpPage.connect(pageEndpoint);
    return { cdp, child, output };
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}

async function stopPackagedApp(app: RunningApp): Promise<void> {
  app.cdp.close();
  if (app.child.exitCode !== null) return;

  app.child.kill('SIGTERM');
  await Promise.race([
    once(app.child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (app.child.exitCode === null) {
    app.child.kill('SIGKILL');
    await once(app.child, 'exit').catch(() => undefined);
  }
}

async function startFixtureServer(): Promise<{ server: Server; url: string }> {
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
}

async function navigateFromMainUi(cdp: CdpPage, url: string): Promise<void> {
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
}

test('opens a WebGL2 page and creates an in-memory composed preview', async () => {
  const fixture = await startFixtureServer();
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'frameshot-e2e-'),
  );
  let app: RunningApp | null = null;

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
      stageHeight: number;
      stageWidth: number;
      shellHeight: number;
      shellWidth: number;
    }>(`
      (() => {
        const settingsButton = document.querySelector(
          'button[aria-controls="settings-panel"]',
        );
        const settingsSlot = document.querySelector('.settings-panel-slot');
        const shell = document.querySelector('.canvas-shell');
        const stage = document.querySelector('.capture-stage');
        if (
          !(settingsButton instanceof HTMLButtonElement) ||
          !(settingsSlot instanceof HTMLElement) ||
          !(shell instanceof HTMLElement) ||
          !(stage instanceof HTMLElement)
        ) {
          throw new Error('The initial studio layout is incomplete.');
        }
        const shellRect = shell.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        return {
          actionDockExists: document.querySelector('.action-dock') !== null,
          captionExists: document.querySelector('.canvas-caption') !== null,
          settingsExpanded: settingsButton.getAttribute('aria-expanded') === 'true',
          settingsFooterExists:
            document.querySelector('.settings-footer') !== null,
          settingsHidden:
            settingsSlot.getAttribute('aria-hidden') === 'true' &&
            settingsSlot.inert,
          stageHeight: stageRect.height,
          stageWidth: stageRect.width,
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
    expect(
      Math.min(
        Math.abs(initialLayout.shellWidth - initialLayout.stageWidth),
        Math.abs(initialLayout.shellHeight - initialLayout.stageHeight),
      ),
    ).toBeLessThanOrEqual(1);

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
            `document.querySelector('.capture-stage')?.getBoundingClientRect().width ?? 0`,
          ),
        { timeout: 5_000 },
      )
      .toBeLessThan(initialLayout.stageWidth);
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

    const addressCenterDelta = await cdp.evaluate<number>(`
      (() => {
        const bar = document.querySelector('.live-browser-bar');
        const address = document.querySelector('.live-address');
        if (!(bar instanceof HTMLElement) || !(address instanceof HTMLElement)) {
          throw new Error('The live browser address was not found.');
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

    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            Array.from(document.querySelectorAll('button')).some(
              (candidate) =>
                candidate.textContent?.includes('撮影') &&
                !candidate.disabled,
            )
          `),
        { timeout: 20_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      (() => {
        const button = Array.from(document.querySelectorAll('button')).find(
          (candidate) =>
            candidate.textContent?.includes('撮影') &&
            !candidate.disabled,
        );
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error('Capture button was not found.');
        }
        button.click();
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(`
            (() => {
              const image = document.querySelector(
                'img[alt="完成したスクリーンショット"]',
              );
              return image instanceof HTMLImageElement &&
                image.complete &&
                image.naturalWidth === 1920 &&
                image.naturalHeight === 1080;
            })()
          `),
        { timeout: 30_000 },
      )
      .toBe(true);

    const layout = calculateCompositionLayout(DEFAULT_SETTINGS);
    const samplePoint = {
      x: Math.round(layout.screen.x + layout.screen.width * 0.12),
      y: Math.round(layout.screen.y + layout.screen.height * 0.82),
    };
    const pixels = await cdp.evaluate<{
      background: number[];
      page: number[];
    }>(`
      (async () => {
        const element = document.querySelector(
          'img[alt="完成したスクリーンショット"]',
        );
        if (!(element instanceof HTMLImageElement)) {
          throw new Error('Preview is not an image.');
        }
        await element.decode();
        const canvas = document.createElement('canvas');
        canvas.width = element.naturalWidth;
        canvas.height = element.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas2D is unavailable.');
        context.drawImage(element, 0, 0);
        return {
          background: Array.from(context.getImageData(4, 4, 1, 1).data),
          page: Array.from(context.getImageData(
            ${samplePoint.x},
            ${samplePoint.y},
            1,
            1,
          ).data),
        };
      })()
    `);
    expect(pixels.page[0]).toBeGreaterThanOrEqual(45);
    expect(pixels.page[0]).toBeLessThanOrEqual(60);
    expect(pixels.page[1]).toBeGreaterThanOrEqual(195);
    expect(pixels.page[1]).toBeLessThanOrEqual(215);
    expect(pixels.page[2]).toBeGreaterThanOrEqual(118);
    expect(pixels.page[2]).toBeLessThanOrEqual(138);
    expect(pixels.page[3]).toBe(255);
    expect(pixels.background[0]).toBeGreaterThanOrEqual(235);
    expect(pixels.background[1]).toBeGreaterThanOrEqual(
      pixels.background[0],
    );
    expect(pixels.background[2]).toBeGreaterThanOrEqual(238);
    expect(pixels.background[3]).toBe(255);

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

    await cdp.evaluate(`
      (() => {
        document.querySelector('button[aria-controls="settings-panel"]')?.click();
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
        setter?.call(input, '#eaf7ef');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await expect
      .poll(
        () =>
          cdp.evaluate<boolean>(
            `document.querySelector('.toolbar-context-action')?.textContent?.includes('再合成') === true`,
          ),
        { timeout: 5_000 },
      )
      .toBe(true);
    await cdp.evaluate(`
      document.querySelector('.toolbar-context-action')?.click()
    `);
    let recomposeOutcome = 'pending';
    await expect
      .poll(
        async () => {
          recomposeOutcome = await cdp.evaluate<string>(`
            (() => {
              if (document.querySelector('.toolbar-context-action') === null) {
                return 'complete';
              }
              const error = document.querySelector('.toast-notice.error');
              return error ? 'error:' + error.textContent : 'pending';
            })()
          `);
          return recomposeOutcome !== 'pending';
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    if (recomposeOutcome !== 'complete') {
      const diagnostics = await cdp.evaluate<{
        busy: string | null;
        contextDisabled: boolean | null;
        contextText: string | null;
      }>(`
        (() => {
          const context = document.querySelector('.toolbar-context-action');
          return {
            busy: document.querySelector('.busy-indicator')?.textContent ?? null,
            contextDisabled:
              context instanceof HTMLButtonElement ? context.disabled : null,
            contextText: context?.textContent ?? null,
          };
        })()
      `);
      throw new Error(
        `Header recompose failed: ${recomposeOutcome}; ${JSON.stringify(diagnostics)}`,
      );
    }

    const leakedFiles = fs
      .readdirSync(tempDirectory)
      .filter((name) => name.startsWith('frameshot-export-'));
    expect(leakedFiles).toEqual([]);
  } catch (error) {
    if (app) {
      console.error(`FrameShot process output:\n${app.output()}`);
    }
    throw error;
  } finally {
    if (app) await stopPackagedApp(app);
    fixture.server.close();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('keeps target cookies only for the current app process', async () => {
  const fixture = await startFixtureServer();
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'frameshot-session-e2e-'),
  );
  const sessionUrl = new URL('/session', fixture.url).href;
  let app: RunningApp | null = null;

  try {
    app = await launchPackagedApp(tempDirectory);
    await waitForMainUi(app.cdp);
    await navigateFromMainUi(app.cdp, `${sessionUrl}?visit=first`);
    await waitForMainText(app.cdp, 'FrameShot session — fresh');
    await navigateFromMainUi(app.cdp, `${sessionUrl}?visit=second`);
    await waitForMainText(app.cdp, 'FrameShot session — reused');

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

    await stopPackagedApp(app);
    app = null;

    app = await launchPackagedApp(tempDirectory);
    await waitForMainUi(app.cdp);
    expect(
      await app.cdp.evaluate<boolean>(
        `document.querySelector('button[aria-controls="settings-panel"]')?.getAttribute('aria-expanded') === 'true'`,
      ),
    ).toBe(true);
    await navigateFromMainUi(app.cdp, `${sessionUrl}?visit=restart`);
    await waitForMainText(app.cdp, 'FrameShot session — fresh');
  } catch (error) {
    if (app) {
      console.error(`FrameShot process output:\n${app.output()}`);
    }
    throw error;
  } finally {
    if (app) await stopPackagedApp(app);
    fixture.server.close();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
