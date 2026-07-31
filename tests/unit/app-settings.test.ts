import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dismissViewportMenuState,
  restoreSettings,
} from '../../src/renderer/App';
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
  it('prefers current v4 settings without changing user values', () => {
    const current = {
      ...DEFAULT_SETTINGS,
      margin: 8,
      cornerRadius: 13,
    };
    installSettingsStorage({
      'frameshot:settings:v4': current,
      'frameshot:settings:v3': current,
      'frameshot:settings:v2': {
        ...DEFAULT_SETTINGS,
        margin: 32,
        cornerRadius: 28,
      },
    });

    expect(restoreSettings()).toEqual(current);
  });

  it('migrates the v3 default margin and leaves the stored value available', () => {
    const v3 = {
      ...DEFAULT_SETTINGS,
      margin: 8,
      gradientAngle: 212,
    };
    const entries = installSettingsStorage({
      'frameshot:settings:v3': v3,
    });

    expect(restoreSettings()).toEqual({
      ...v3,
      margin: 32,
    });
    expect(JSON.parse(entries.get('frameshot:settings:v3') ?? '')).toEqual(v3);
  });

  it('preserves a custom v3 margin', () => {
    const v3 = {
      ...DEFAULT_SETTINGS,
      margin: 19,
    };
    installSettingsStorage({ 'frameshot:settings:v3': v3 });

    expect(restoreSettings()).toEqual(v3);
  });

  it('migrates only the v2 corner-radius default and preserves its margin', () => {
    const v2 = {
      ...DEFAULT_SETTINGS,
      margin: 8,
      cornerRadius: 28,
      waitMs: 1_000,
    };
    const entries = installSettingsStorage({
      'frameshot:settings:v2': v2,
    });

    expect(restoreSettings()).toEqual({
      ...v2,
      cornerRadius: 8,
    });
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
