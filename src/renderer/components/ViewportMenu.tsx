import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  devicePresetsFor,
  findDevicePreset,
} from '@shared/presets';
import type {
  CaptureSettings,
  DevicePreset,
  DeviceMode,
} from '@shared/types';
import {
  ChevronDownIcon,
  MonitorIcon,
  PhoneIcon,
} from './Icons';
import './ViewportMenu.css';

function moveMenuFocus(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitemradio"]',
    ),
  );
  if (items.length === 0) return;
  event.preventDefault();
  const currentIndex = items.indexOf(
    document.activeElement as HTMLButtonElement,
  );
  const delta = event.key === 'ArrowDown' ? 1 : -1;
  const nextIndex =
    currentIndex < 0
      ? delta > 0
        ? 0
        : items.length - 1
      : (currentIndex + delta + items.length) % items.length;
  items[nextIndex]?.focus();
}

interface ViewportMenuListProps {
  deviceMode: DeviceMode;
  settings: CaptureSettings;
  onDevicePreset: (preset: DevicePreset) => void;
  onCustomSize: (deviceMode: DeviceMode) => void;
  onDismiss: (restoreTriggerFocus: boolean) => void;
}

interface PresetGroup {
  id: string;
  label: string;
  presets: readonly DevicePreset[];
}

function shouldRestoreTriggerFocus(
  event: MouseEvent<HTMLButtonElement>,
): boolean {
  return event.detail === 0;
}

export function ViewportMenuList({
  deviceMode,
  settings,
  onDevicePreset,
  onCustomSize,
  onDismiss,
}: ViewportMenuListProps): React.JSX.Element {
  const exactPreset = findDevicePreset(settings);
  const label = deviceMode === 'desktop' ? 'Desktop' : 'Phone';
  const sizeLabel = 'Webビューサイズ';
  const presets = devicePresetsFor(deviceMode);
  const presetGroups: readonly PresetGroup[] =
    deviceMode === 'desktop'
      ? [
          {
            id: 'full-hd-and-below',
            label: 'Full HD以下',
            presets: presets.filter(
              (preset) =>
                preset.kind === 'desktop' &&
                preset.group === 'full-hd-and-below',
            ),
          },
          {
            id: 'high-resolution',
            label: '高解像度',
            presets: presets.filter(
              (preset) =>
                preset.kind === 'desktop' &&
                preset.group === 'high-resolution',
            ),
          },
        ]
      : [
          {
            id: 'android',
            label: 'Android',
            presets: presets.filter(
              (preset) =>
                preset.kind === 'mobile' && preset.group === 'android',
            ),
          },
          {
            id: 'iphone',
            label: 'iPhone',
            presets: presets.filter(
              (preset) =>
                preset.kind === 'mobile' && preset.group === 'iphone',
            ),
          },
          {
            id: 'ipad',
            label: 'iPad',
            presets: presets.filter(
              (preset) =>
                preset.kind === 'mobile' && preset.group === 'ipad',
            ),
          },
        ];

  return (
    <div
      className="viewport-menu-list"
      role="menu"
      aria-label={`${label} ${sizeLabel}プリセット`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onDismiss(true);
          return;
        }
        moveMenuFocus(event);
      }}
    >
      {presetGroups.map((group) => {
        const headingId = `viewport-${deviceMode}-${group.id}-heading`;
        return (
          <div
            className="viewport-menu-group"
            role="group"
            aria-labelledby={headingId}
            key={group.id}
          >
            <span className="viewport-menu-heading" id={headingId}>
              {group.label}
            </span>
            {group.presets.map((preset) => {
              const selected = exactPreset?.id === preset.id;
              return (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  key={preset.id}
                  className={selected ? 'selected' : ''}
                  onClick={(event) => {
                    onDevicePreset(preset);
                    onDismiss(shouldRestoreTriggerFocus(event));
                  }}
                >
                  <span>
                    <b>{preset.name}</b>
                    <small>
                      {preset.kind === 'desktop'
                        ? `${preset.outputWidth} × ${preset.outputHeight}`
                        : `${preset.viewportWidth} × ${preset.viewportHeight}`}
                    </small>
                  </span>
                  {selected && <i aria-hidden="true">✓</i>}
                </button>
              );
            })}
          </div>
        );
      })}
      <button
        type="button"
        role="menuitemradio"
        aria-checked={
          settings.deviceMode === deviceMode && !exactPreset
        }
        className={
          settings.deviceMode === deviceMode && !exactPreset
            ? 'selected custom'
            : 'custom'
        }
        onClick={() => {
          onCustomSize(deviceMode);
          onDismiss(false);
        }}
      >
        <span>
          <b>Custom…</b>
          <small>Webビューサイズを入力</small>
        </span>
        {settings.deviceMode === deviceMode && !exactPreset && (
          <i aria-hidden="true">✓</i>
        )}
      </button>
    </div>
  );
}

interface ViewportMenuProps {
  settings: CaptureSettings;
  openMenu: DeviceMode | null;
  onDevicePreset: (preset: DevicePreset) => void;
  onCustomSize: (deviceMode: DeviceMode) => void;
  onMenuOpen: (deviceMode: DeviceMode) => void;
  onMenuDismiss: (deviceMode: DeviceMode) => void;
}

export function ViewportMenu({
  settings,
  openMenu,
  onDevicePreset,
  onCustomSize,
  onMenuOpen,
  onMenuDismiss,
}: ViewportMenuProps): React.JSX.Element {
  const viewportMenusRef = useRef<HTMLDivElement>(null);
  const viewportTriggerRefs = useRef<
    Record<DeviceMode, HTMLButtonElement | null>
  >({
    desktop: null,
    mobile: null,
  });
  const exactPreset = findDevicePreset(settings);

  const closeViewportMenu = useCallback(
    (deviceMode: DeviceMode, restoreTriggerFocus: boolean): void => {
      onMenuDismiss(deviceMode);
      if (restoreTriggerFocus) {
        requestAnimationFrame(() =>
          viewportTriggerRefs.current[deviceMode]?.focus(),
        );
      }
    },
    [onMenuDismiss],
  );

  useEffect(() => {
    if (!openMenu) return;
    const closeOnPointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !viewportMenusRef.current?.contains(event.target)
      ) {
        closeViewportMenu(openMenu, false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeViewportMenu(openMenu, true);
      }
    };
    document.addEventListener('pointerdown', closeOnPointer);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [closeViewportMenu, openMenu]);

  const renderViewportMenu = (
    deviceMode: DeviceMode,
  ): React.JSX.Element => {
    const active = settings.deviceMode === deviceMode;
    const label = deviceMode === 'desktop' ? 'Desktop' : 'Phone';
    const Icon = deviceMode === 'desktop' ? MonitorIcon : PhoneIcon;
    const expanded = openMenu === deviceMode;
    return (
      <div
        className={`viewport-menu ${active ? 'active' : ''}`}
        data-device-mode={deviceMode}
      >
        <button
          ref={(trigger) => {
            viewportTriggerRefs.current[deviceMode] = trigger;
          }}
          type="button"
          className="viewport-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={expanded}
          onClick={() => {
            if (expanded) {
              closeViewportMenu(deviceMode, false);
            } else {
              onMenuOpen(deviceMode);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              onMenuOpen(deviceMode);
              requestAnimationFrame(() => {
                viewportMenusRef.current
                  ?.querySelector<HTMLButtonElement>(
                    `[data-device-mode="${deviceMode}"] [role="menu"] button`,
                  )
                  ?.focus();
              });
            }
          }}
        >
          <Icon />
          <span>
            <b>{label}</b>
            {active && (
              <small>
                {exactPreset?.name ?? 'Custom'} ·{' '}
                {deviceMode === 'desktop'
                  ? `${settings.outputWidth}×${settings.outputHeight}`
                  : `${settings.viewportWidth}×${settings.viewportHeight}`}
              </small>
            )}
          </span>
          <ChevronDownIcon />
        </button>
        {expanded && (
          <ViewportMenuList
            deviceMode={deviceMode}
            settings={settings}
            onDevicePreset={onDevicePreset}
            onCustomSize={onCustomSize}
            onDismiss={(restoreTriggerFocus) =>
              closeViewportMenu(deviceMode, restoreTriggerFocus)
            }
          />
        )}
      </div>
    );
  };

  return (
    <div
      className="toolbar-view-group"
      ref={viewportMenusRef}
      aria-label="Webビューサイズプリセット"
    >
      {renderViewportMenu('desktop')}
      {renderViewportMenu('mobile')}
    </div>
  );
}
