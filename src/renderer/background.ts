import type { CSSProperties } from 'react';
import type {
  BackgroundStyle,
  CaptureSettings,
  GradientPreset,
} from '@shared/types';

type BackgroundSource = Pick<
  CaptureSettings,
  'gradientFrom' | 'gradientTo' | 'gradientAngle'
>;

export type BackgroundCssProperties = CSSProperties & {
  '--background-angle': string;
  '--background-from': string;
  '--background-to': string;
};

export function backgroundCssProperties(
  source: BackgroundSource,
): BackgroundCssProperties {
  return {
    '--background-angle': `${source.gradientAngle}deg`,
    '--background-from': source.gradientFrom,
    '--background-to': source.gradientTo,
  };
}

export function gradientPresetCssProperties(
  preset: GradientPreset,
): BackgroundCssProperties {
  return backgroundCssProperties({
    gradientFrom: preset.from,
    gradientTo: preset.to,
    gradientAngle: preset.angle,
  });
}

export function backgroundClassName(
  backgroundStyle: BackgroundStyle,
): string {
  return `background-${backgroundStyle}`;
}

export function isGradientPresetActive(
  settings: CaptureSettings,
  preset: GradientPreset,
): boolean {
  return (
    settings.gradientFrom === preset.from &&
    settings.gradientTo === preset.to &&
    settings.gradientAngle === preset.angle &&
    settings.backgroundStyle === preset.backgroundStyle
  );
}
