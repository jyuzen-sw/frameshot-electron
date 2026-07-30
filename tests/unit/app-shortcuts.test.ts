import { describe, expect, it, vi } from 'vitest';
import {
  appShortcutForInput,
  dispatchAppShortcutInput,
} from '../../src/main/app-shortcuts';

const BASE_INPUT = {
  type: 'keyDown',
  key: '',
  control: false,
  meta: false,
  alt: false,
  isAutoRepeat: false,
  isComposing: false,
};

describe('appShortcutForInput', () => {
  it.each([
    ['s', 'save'],
    ['L', 'focus-url'],
    ['r', 'reload-target'],
  ] as const)('maps Ctrl+%s outside macOS to %s', (key, shortcut) => {
    expect(
      appShortcutForInput(
        { ...BASE_INPUT, key, control: true },
        'linux',
      ),
    ).toBe(shortcut);
  });

  it('uses Command instead of Control on macOS', () => {
    expect(
      appShortcutForInput(
        { ...BASE_INPUT, key: 's', meta: true },
        'darwin',
      ),
    ).toBe('save');
    expect(
      appShortcutForInput(
        { ...BASE_INPUT, key: 's', control: true },
        'darwin',
      ),
    ).toBeNull();
  });

  it('accepts Chromium raw key-down events', () => {
    expect(
      appShortcutForInput(
        {
          ...BASE_INPUT,
          type: 'rawKeyDown',
          key: 'l',
          control: true,
        },
        'linux',
      ),
    ).toBe('focus-url');
  });

  it.each([
    { key: 's' },
    { key: 'x', control: true },
    { key: 's', control: true, alt: true },
    { key: 's', control: true, isAutoRepeat: true },
    { key: 's', control: true, isComposing: true },
    { type: 'keyUp', key: 's', control: true },
  ])('ignores non-shortcut input %#', (patch) => {
    expect(
      appShortcutForInput(
        { ...BASE_INPUT, ...patch },
        'linux',
      ),
    ).toBeNull();
  });

  it('prevents the page event and dispatches a matched shortcut', () => {
    const event = { preventDefault: vi.fn() };
    const onShortcut = vi.fn();

    expect(
      dispatchAppShortcutInput(
        event,
        { ...BASE_INPUT, key: 'r', control: true },
        onShortcut,
        'linux',
      ),
    ).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onShortcut).toHaveBeenCalledWith('reload-target');
  });

  it('leaves unrelated page input untouched', () => {
    const event = { preventDefault: vi.fn() };
    const onShortcut = vi.fn();

    expect(
      dispatchAppShortcutInput(
        event,
        { ...BASE_INPUT, key: 'x', control: true },
        onShortcut,
        'linux',
      ),
    ).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onShortcut).not.toHaveBeenCalled();
  });
});
