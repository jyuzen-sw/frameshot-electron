import { afterEach, describe, expect, it, vi } from 'vitest';
import { restoreSettings } from '../../src/renderer/App';
import { DEFAULT_SETTINGS } from '../../src/shared/presets';

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
  it('prefers current v3 settings without changing user values', () => {
    const current = {
      ...DEFAULT_SETTINGS,
      margin: 19,
      cornerRadius: 13,
    };
    installSettingsStorage({
      'frameshot:settings:v3': current,
      'frameshot:settings:v2': {
        ...DEFAULT_SETTINGS,
        margin: 32,
        cornerRadius: 28,
      },
    });

    expect(restoreSettings()).toEqual(current);
  });

  it('migrates only legacy defaults and leaves the v2 value available', () => {
    const legacy = {
      ...DEFAULT_SETTINGS,
      margin: 32,
      cornerRadius: 28,
      gradientAngle: 212,
      waitMs: 1_000,
    };
    const entries = installSettingsStorage({
      'frameshot:settings:v2': legacy,
    });

    expect(restoreSettings()).toEqual({
      ...legacy,
      margin: 8,
      cornerRadius: 8,
    });
    expect(JSON.parse(entries.get('frameshot:settings:v2') ?? '')).toEqual(
      legacy,
    );
  });
});
