import os from 'node:os';

export interface ClipboardImage {
  isEmpty(): boolean;
  getSize(): {
    width: number;
    height: number;
  };
}

export interface ImageClipboardAdapter<
  TImage extends ClipboardImage,
> {
  writeImage(image: TImage): void;
  readImage(): TImage;
}

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

export function writeVerifiedClipboardImage<
  TImage extends ClipboardImage,
>(
  adapter: ImageClipboardAdapter<TImage>,
  image: TImage,
): void {
  const expectedSize = image.getSize();
  adapter.writeImage(image);
  const copiedImage = adapter.readImage();
  const actualSize = copiedImage.getSize();

  if (
    copiedImage.isEmpty() ||
    actualSize.width !== expectedSize.width ||
    actualSize.height !== expectedSize.height
  ) {
    const actual = copiedImage.isEmpty()
      ? '空の画像'
      : `${actualSize.width}x${actualSize.height}`;
    throw new Error(
      `クリップボードへの画像コピーを確認できませんでした。期待: ${expectedSize.width}x${expectedSize.height}、実際: ${actual}`,
    );
  }
}
