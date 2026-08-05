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
  prepareSurface(): Promise<void>;
  prepareCapture(): Promise<void>;
  capturePage(
    rectangle: PageCaptureRectangle,
    options: {
      stayHidden: false;
    },
  ): Promise<TImage>;
}

export interface RestorablePageCaptureAdapter<TResult> {
  capture(): Promise<TResult>;
  restore(): Promise<void>;
}

export interface WarmupCaptureAdapter<TResult> {
  prepareCapture(): Promise<void>;
  capture(): Promise<TResult>;
}

const MAX_CAPTURE_CANDIDATES = 2;

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

export async function captureAfterWarmup<TResult>(
  adapter: WarmupCaptureAdapter<TResult>,
  accepts: (result: TResult) => boolean,
  failure: (lastResult: TResult) => Error,
): Promise<TResult> {
  await adapter.prepareCapture();
  // DOM readiness does not guarantee that Chromium has completed a heavy
  // compositor frame, so the first capture only warms the new surface.
  try {
    await adapter.capture();
  } catch {
    // The discarded warmup must not let a transient capture failure consume
    // either of the validated capture candidates.
  }

  await adapter.prepareCapture();
  let lastResult = await adapter.capture();
  if (accepts(lastResult)) return lastResult;

  for (
    let candidate = 1;
    candidate < MAX_CAPTURE_CANDIDATES;
    candidate += 1
  ) {
    await adapter.prepareCapture();
    lastResult = await adapter.capture();
    if (accepts(lastResult)) return lastResult;
  }

  throw failure(lastResult);
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
  await adapter.prepareSurface();

  return captureAfterWarmup(
    {
      prepareCapture: () => adapter.prepareCapture(),
      // Do not add stayAwake: Electron 43 can crash while cancelling its capture wake lock on Windows.
      capture: () =>
        adapter.capturePage(rectangle, {
          stayHidden: false,
        }),
    },
    (image) => {
      const actualSize = image.getSize();
      return (
        !image.isEmpty() &&
        actualSize.width === expectedSize.width &&
        actualSize.height === expectedSize.height
      );
    },
    (image) =>
      new Error(
        `ページ画像の取得寸法が一致しません。期待: ${expectedSize.width}x${expectedSize.height}、実際: ${imageSizeDescription(image)}`,
      ),
  );
}
