import type { Input } from 'electron';
import type { AppShortcut } from '@shared/types';

type ShortcutInput = Pick<
  Input,
  | 'alt'
  | 'control'
  | 'isAutoRepeat'
  | 'isComposing'
  | 'key'
  | 'meta'
  | 'type'
>;

interface PreventableInputEvent {
  preventDefault: () => void;
}

export function appShortcutForInput(
  input: ShortcutInput,
  platform: NodeJS.Platform = process.platform,
): AppShortcut | null {
  const primaryModifier =
    platform === 'darwin' ? input.meta : input.control;
  if (
    (input.type !== 'keyDown' && input.type !== 'rawKeyDown') ||
    !primaryModifier ||
    input.alt ||
    input.isAutoRepeat ||
    input.isComposing
  ) {
    return null;
  }

  switch (input.key.toLowerCase()) {
    case 's':
      return 'save';
    case 'l':
      return 'focus-url';
    case 'r':
      return 'reload-target';
    default:
      return null;
  }
}

export function dispatchAppShortcutInput(
  event: PreventableInputEvent,
  input: ShortcutInput,
  onShortcut: (shortcut: AppShortcut) => void,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const shortcut = appShortcutForInput(input, platform);
  if (!shortcut) return false;
  event.preventDefault();
  onShortcut(shortcut);
  return true;
}
