import { describe, expect, it } from 'vitest';
import {
  assertImageClipboardSupported,
  isWslRuntime,
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
