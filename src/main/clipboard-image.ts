import os from 'node:os';

export interface RuntimeEnvironment {
  platform: NodeJS.Platform;
  environment: NodeJS.ProcessEnv;
  osRelease: string;
}

const WSL_CLIPBOARD_ERROR =
  'WSL2/WSLgからWindows側への画像コピーは未対応です。Windows版FrameShotを起動するか、保存を使用してください。';

export function currentRuntimeEnvironment(): RuntimeEnvironment {
  return {
    platform: process.platform,
    environment: process.env,
    osRelease: os.release(),
  };
}

export function isWslRuntime(runtime: RuntimeEnvironment): boolean {
  if (runtime.platform !== 'linux') return false;
  return Boolean(
    runtime.environment.WSL_DISTRO_NAME ||
      runtime.environment.WSL_INTEROP ||
      /microsoft/i.test(runtime.osRelease),
  );
}

export function assertImageClipboardSupported(
  runtime = currentRuntimeEnvironment(),
): void {
  if (isWslRuntime(runtime)) {
    throw new Error(WSL_CLIPBOARD_ERROR);
  }
}
