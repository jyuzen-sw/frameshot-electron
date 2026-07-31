import { describe, expect, it, vi } from 'vitest';
import {
  assertImageClipboardSupported,
  isWslRuntime,
  writeVerifiedClipboardImage,
  type ClipboardImage,
  type RuntimeEnvironment,
} from '../../src/main/clipboard-image';

function runtime(
  overrides: Partial<RuntimeEnvironment> = {},
): RuntimeEnvironment {
  return {
    platform: 'win32',
    environment: {},
    osRelease: '10.0.26100',
    ...overrides,
  };
}

function image(width: number, height: number): ClipboardImage {
  return {
    isEmpty: () => width === 0 || height === 0,
    getSize: () => ({ width, height }),
  };
}

describe('clipboard runtime support', () => {
  it('detects WSL from its environment or kernel release', () => {
    expect(
      isWslRuntime(
        runtime({
          platform: 'linux',
          environment: { WSL_DISTRO_NAME: 'Ubuntu' },
          osRelease: '6.6.87.2',
        }),
      ),
    ).toBe(true);
    expect(
      isWslRuntime(
        runtime({
          platform: 'linux',
          osRelease: '6.6.87.2-microsoft-standard-WSL2',
        }),
      ),
    ).toBe(true);
    expect(
      isWslRuntime(
        runtime({
          platform: 'linux',
          osRelease: '6.8.0-generic',
        }),
      ),
    ).toBe(false);
  });

  it('rejects WSL before an image is generated', () => {
    expect(() =>
      assertImageClipboardSupported(
        runtime({
          platform: 'linux',
          environment: { WSL_INTEROP: '/run/WSL/123_interop' },
        }),
      ),
    ).toThrow('Windows版FrameShotを起動するか、保存を使用してください');
  });
});

describe('writeVerifiedClipboardImage', () => {
  it('writes the image and confirms the copied dimensions', () => {
    const source = image(1920, 1080);
    const adapter = {
      writeImage: vi.fn(),
      readImage: vi.fn(() => image(1920, 1080)),
    };

    expect(() => writeVerifiedClipboardImage(adapter, source)).not.toThrow();
    expect(adapter.writeImage).toHaveBeenCalledWith(source);
    expect(adapter.readImage).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty clipboard image', () => {
    const adapter = {
      writeImage: vi.fn(),
      readImage: vi.fn(() => image(0, 0)),
    };

    expect(() =>
      writeVerifiedClipboardImage(adapter, image(1920, 1080)),
    ).toThrow('期待: 1920x1080、実際: 空の画像');
  });

  it('rejects a clipboard image with different dimensions', () => {
    const adapter = {
      writeImage: vi.fn(),
      readImage: vi.fn(() => image(960, 540)),
    };

    expect(() =>
      writeVerifiedClipboardImage(adapter, image(1920, 1080)),
    ).toThrow('期待: 1920x1080、実際: 960x540');
  });
});
