export interface CapturedPageImage {
  isEmpty(): boolean;
  getSize(): {
    width: number;
    height: number;
  };
}

export interface PageCaptureRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExactPageCaptureAdapter<TImage extends CapturedPageImage> {
  prepareAttempt(): Promise<void>;
  invalidate(): void;
  capturePage(
    rectangle: PageCaptureRectangle,
    options: {
      stayHidden: false;
      stayAwake: true;
    },
  ): Promise<TImage>;
}

export interface RestorablePageCaptureAdapter<TResult> {
  capture(): Promise<TResult>;
  restore(): Promise<void>;
}

const MAX_CAPTURE_ATTEMPTS = 2;

function imageSizeDescription(image: CapturedPageImage): string {
  if (image.isEmpty()) return '空の画像';
  const size = image.getSize();
  return `${size.width}x${size.height}`;
}

export async function captureWithRestoration<TResult>(
  adapter: RestorablePageCaptureAdapter<TResult>,
): Promise<TResult> {
  let captureSucceeded = false;
  try {
    const result = await adapter.capture();
    captureSucceeded = true;
    return result;
  } finally {
    try {
      await adapter.restore();
    } catch (restoreError) {
      if (captureSucceeded) throw restoreError;
      // Keep the capture failure that is already propagating.
    }
  }
}

export async function captureExactPage<
  TImage extends CapturedPageImage,
>(
  adapter: ExactPageCaptureAdapter<TImage>,
  expectedSize: {
    width: number;
    height: number;
  },
): Promise<TImage> {
  const rectangle: PageCaptureRectangle = {
    x: 0,
    y: 0,
    width: expectedSize.width,
    height: expectedSize.height,
  };
  let lastActual = '未取得';

  for (let attempt = 0; attempt < MAX_CAPTURE_ATTEMPTS; attempt += 1) {
    await adapter.prepareAttempt();
    adapter.invalidate();
    const image = await adapter.capturePage(rectangle, {
      stayHidden: false,
      stayAwake: true,
    });
    lastActual = imageSizeDescription(image);
    const actualSize = image.getSize();

    if (
      !image.isEmpty() &&
      actualSize.width === expectedSize.width &&
      actualSize.height === expectedSize.height
    ) {
      return image;
    }
  }

  throw new Error(
    `ページ画像の取得寸法が一致しません。期待: ${expectedSize.width}x${expectedSize.height}、実際: ${lastActual}`,
  );
}
