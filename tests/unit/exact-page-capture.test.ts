import { describe, expect, it, vi } from 'vitest';
import {
  captureExactPage,
  captureWithRestoration,
  type CapturedPageImage,
  type ExactPageCaptureAdapter,
} from '../../src/main/exact-page-capture';

function image(width: number, height: number): CapturedPageImage {
  return {
    isEmpty: () => width === 0 || height === 0,
    getSize: () => ({ width, height }),
  };
}

function adapterWith(
  images: CapturedPageImage[],
): ExactPageCaptureAdapter<CapturedPageImage> {
  return {
    prepareSurface: vi.fn(async () => undefined),
    prepareCapture: vi.fn(async () => undefined),
    capturePage: vi.fn(async () => images.shift() ?? image(0, 0)),
  };
}

describe('captureExactPage', () => {
  it('returns a complete image captured after the initial surface paint', async () => {
    const initialPaint = image(2880, 1800);
    const expected = image(2880, 1800);
    const adapter = adapterWith([initialPaint, expected]);

    await expect(
      captureExactPage(adapter, { width: 2880, height: 1800 }),
    ).resolves.toBe(expected);
    expect(adapter.prepareSurface).toHaveBeenCalledTimes(1);
    expect(adapter.prepareCapture).toHaveBeenCalledTimes(2);
    expect(adapter.capturePage).toHaveBeenCalledTimes(2);
    expect(adapter.capturePage).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 2880, height: 1800 },
      { stayHidden: false },
    );
  });

  it('continues with a validated capture when the warmup capture fails', async () => {
    const expected = image(2880, 1800);
    const adapter = adapterWith([expected]);
    vi.mocked(adapter.capturePage).mockRejectedValueOnce(
      new Error('warmup capture failed'),
    );

    await expect(
      captureExactPage(adapter, { width: 2880, height: 1800 }),
    ).resolves.toBe(expected);
    expect(adapter.prepareSurface).toHaveBeenCalledTimes(1);
    expect(adapter.prepareCapture).toHaveBeenCalledTimes(2);
    expect(adapter.capturePage).toHaveBeenCalledTimes(2);
  });

  it('reports a failure from a validated capture', async () => {
    const captureError = new Error('validated capture failed');
    const adapter = adapterWith([]);
    vi.mocked(adapter.capturePage)
      .mockResolvedValueOnce(image(2880, 1800))
      .mockRejectedValueOnce(captureError);

    await expect(
      captureExactPage(adapter, { width: 2880, height: 1800 }),
    ).rejects.toBe(captureError);
    expect(adapter.capturePage).toHaveBeenCalledTimes(2);
  });

  it('repaints and retries after receiving a stale-size candidate', async () => {
    const initialPaint = image(2880, 1800);
    const expected = image(2880, 1800);
    const adapter = adapterWith([
      initialPaint,
      image(1193, 746),
      expected,
    ]);

    await expect(
      captureExactPage(adapter, { width: 2880, height: 1800 }),
    ).resolves.toBe(expected);
    expect(adapter.prepareSurface).toHaveBeenCalledTimes(1);
    expect(adapter.prepareCapture).toHaveBeenCalledTimes(3);
    expect(adapter.capturePage).toHaveBeenCalledTimes(3);
  });

  it('reports expected and actual sizes after two mismatches', async () => {
    const adapter = adapterWith([
      image(2880, 1800),
      image(1193, 746),
      image(1440, 900),
    ]);

    await expect(
      captureExactPage(adapter, { width: 2880, height: 1800 }),
    ).rejects.toThrow(
      '期待: 2880x1800、実際: 1440x900',
    );
    expect(adapter.capturePage).toHaveBeenCalledTimes(3);
  });

  it('reports an empty image after two failed attempts', async () => {
    const adapter = adapterWith([
      image(1440, 900),
      image(0, 0),
      image(0, 0),
    ]);

    await expect(
      captureExactPage(adapter, { width: 1440, height: 900 }),
    ).rejects.toThrow('期待: 1440x900、実際: 空の画像');
    expect(adapter.capturePage).toHaveBeenCalledTimes(3);
  });
});

describe('captureWithRestoration', () => {
  it('restores the interactive layout after a successful capture', async () => {
    let layout = 'capture';
    const capture = vi.fn(async () => 'image');
    const restore = vi.fn(async () => {
      layout = 'interactive';
    });

    await expect(
      captureWithRestoration({ capture, restore }),
    ).resolves.toBe('image');
    expect(restore).toHaveBeenCalledTimes(1);
    expect(layout).toBe('interactive');
  });

  it('restores the interactive layout after a failed capture', async () => {
    let layout = 'capture';
    const captureError = new Error('capture failed');
    const restore = vi.fn(async () => {
      layout = 'interactive';
    });

    await expect(
      captureWithRestoration({
        capture: async () => {
          throw captureError;
        },
        restore,
      }),
    ).rejects.toBe(captureError);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(layout).toBe('interactive');
  });

  it('reports a restoration failure after a successful capture', async () => {
    const restoreError = new Error('restore failed');
    const restore = vi.fn(async () => {
      throw restoreError;
    });

    await expect(
      captureWithRestoration({
        capture: async () => 'image',
        restore,
      }),
    ).rejects.toBe(restoreError);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('preserves the capture failure when restoration also fails', async () => {
    const captureError = new Error('capture failed');
    const restore = vi.fn(async () => {
      throw new Error('restore failed');
    });

    await expect(
      captureWithRestoration({
        capture: async () => {
          throw captureError;
        },
        restore,
      }),
    ).rejects.toBe(captureError);
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
