import { describe, expect, it } from 'vitest';
import {
  CAPTURE_PRESETS,
  DEFAULT_SETTINGS,
  GRADIENT_PRESETS,
} from '@shared/presets';

describe('built-in presets', () => {
  it('uses the pale mint gradient as the default background', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      gradientFrom: '#f1faf4',
      gradientTo: '#f8fcf9',
      gradientAngle: 135,
      backgroundStyle: 'soft',
    });

    expect(
      GRADIENT_PRESETS.find((preset) => preset.id === 'mint-pearl'),
    ).toMatchObject({
      from: DEFAULT_SETTINGS.gradientFrom,
      to: DEFAULT_SETTINGS.gradientTo,
      angle: DEFAULT_SETTINGS.gradientAngle,
    });
  });

  it('uses a compact 32px margin for every built-in capture preset', () => {
    expect(CAPTURE_PRESETS).not.toHaveLength(0);
    expect(CAPTURE_PRESETS.every((preset) => preset.settings.margin === 32)).toBe(
      true,
    );
  });
});
