import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dismissViewportMenuState,
  restoreSettings,
} from '../../src/renderer/App';
import { DEFAULT_SETTINGS } from '../../src/shared/presets';
import { normalizeCaptureGeometry } from '../../src/shared/layout';
import type { CaptureSettings } from '../../src/shared/types';

function legacySettings(
  settings: CaptureSettings,
): Omit<CaptureSettings, 'phoneFrameVariant'> {
  const { phoneFrameVariant: _phoneFrameVariant, ...legacy } = settings;
  return legacy;
}

function installSettingsStorage(
  values: Record<string, unknown>,
): Map<string, string> {
  const entries = new Map(
    Object.entries(values).map(([key, value]) => [
      key,
      JSON.stringify(value),
    ]),
  );
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
    },
  });
  return entries;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saved capture settings', () => {
  it('prefers current v6 settings without changing normalized user values', () => {
    const current = normalizeCaptureGeometry({
      ...DEFAULT_SETTINGS,
      margin: 8,
      cornerRadius: 13,
      phoneFrameVariant: 'android' as const,
    });
    installSettingsStorage({
      'frameshot:settings:v6': current,
      'frameshot:settings:v5': DEFAULT_SETTINGS,
    });

    expect(restoreSettings()).toEqual(current);
  });

  it('migrates a v5 desktop setting from its completed output size', () => {
    const v5 = {
      ...DEFAULT_SETTINGS,
      outputWidth: 1600,
      outputHeight: 1000,
      viewportWidth: 1200,
      viewportHeight: 800,
      frameStyle: 'none' as const,
      margin: 19,
      captureScale: 1 as const,
      showUrl: false,
    };
    const entries = installSettingsStorage({ 'frameshot:settings:v5': v5 });

    expect(restoreSettings()).toEqual({
      ...v5,
      viewportWidth: 1562,
      viewportHeight: 962,
    });
    expect(JSON.parse(entries.get('frameshot:settings:v5') ?? '')).toEqual(v5);
  });

  it.each([
    [360, 808, 'phone', 'android', 840, 1736],
    [402, 874, 'phone', 'iphone', 924, 1868],
    [390, 844, 'phone', 'iphone', 900, 1808],
    [768, 1024, 'tablet', 'iphone', 1712, 2224],
  ] as const)(
    'migrates a v4 mobile %sx%s %s frame to %s and an automatic output',
    (
      viewportWidth,
      viewportHeight,
      frameStyle,
      phoneFrameVariant,
      outputWidth,
      outputHeight,
    ) => {
      const v4 = legacySettings({
        ...DEFAULT_SETTINGS,
        deviceMode: 'mobile',
        frameStyle,
        viewportWidth,
        viewportHeight,
        outputWidth: 1080,
        outputHeight: 1350,
        captureScale: 1,
        showUrl: false,
      });
      const entries = installSettingsStorage({
        'frameshot:settings:v4': v4,
      });

      expect(restoreSettings()).toMatchObject({
        phoneFrameVariant,
        outputWidth,
        outputHeight,
        captureScale: 2,
      });
      expect(JSON.parse(entries.get('frameshot:settings:v4') ?? '')).toEqual(
        v4,
      );
    },
  );

  it('adds the phone variant and normalizes a v4 desktop setting', () => {
    const v4 = legacySettings({
      ...DEFAULT_SETTINGS,
      outputWidth: 1600,
      outputHeight: 1000,
      viewportWidth: 1200,
      viewportHeight: 800,
      frameStyle: 'none',
      margin: 19,
      captureScale: 1,
      showUrl: false,
    });
    installSettingsStorage({ 'frameshot:settings:v4': v4 });

    expect(restoreSettings()).toEqual({
      ...v4,
      phoneFrameVariant: 'iphone',
      viewportWidth: 1562,
      viewportHeight: 962,
    });
  });

  it('migrates the v3 default margin and leaves the stored value available', () => {
    const v3 = legacySettings({
      ...DEFAULT_SETTINGS,
      margin: 8,
      gradientAngle: 212,
    });
    const entries = installSettingsStorage({
      'frameshot:settings:v3': v3,
    });

    expect(restoreSettings()).toEqual({
      ...v3,
      phoneFrameVariant: 'iphone',
      margin: 32,
    });
    expect(JSON.parse(entries.get('frameshot:settings:v3') ?? '')).toEqual(v3);
  });

  it('preserves a custom v3 margin', () => {
    const v3 = legacySettings({
      ...DEFAULT_SETTINGS,
      margin: 19,
    });
    installSettingsStorage({ 'frameshot:settings:v3': v3 });

    expect(restoreSettings()).toEqual(
      normalizeCaptureGeometry({
        ...v3,
        phoneFrameVariant: 'iphone',
      }),
    );
  });

  it('migrates only the v2 corner-radius default and preserves its margin', () => {
    const v2 = legacySettings({
      ...DEFAULT_SETTINGS,
      margin: 8,
      cornerRadius: 28,
      waitMs: 1_000,
    });
    const entries = installSettingsStorage({
      'frameshot:settings:v2': v2,
    });

    expect(restoreSettings()).toEqual(
      normalizeCaptureGeometry({
        ...v2,
        phoneFrameVariant: 'iphone',
        cornerRadius: 8,
      }),
    );
    expect(JSON.parse(entries.get('frameshot:settings:v2') ?? '')).toEqual(
      v2,
    );
  });
});

describe('floating UI state', () => {
  it('dismisses only the viewport menu that requested dismissal', () => {
    expect(
      dismissViewportMenuState(
        { kind: 'viewport-menu', deviceMode: 'desktop' },
        'desktop',
      ),
    ).toBeNull();
    expect(
      dismissViewportMenuState(
        { kind: 'viewport-menu', deviceMode: 'mobile' },
        'desktop',
      ),
    ).toEqual({ kind: 'viewport-menu', deviceMode: 'mobile' });
  });

  it('does not let a stale menu dismissal close settings', () => {
    expect(
      dismissViewportMenuState({ kind: 'settings' }, 'desktop'),
    ).toEqual({ kind: 'settings' });
  });
});
