import type { CSSProperties, ReactNode } from 'react';
import { formatUrlForFrame } from '@shared/url';
import { GlobeIcon, LockIcon } from './Icons';

interface BrowserFrameProps {
  children: ReactNode;
  style: CSSProperties;
  scale: number;
  barHeight: number;
  addressHeight: number;
  pageUrl: string;
  showUrl: boolean;
}

function px(value: number): string {
  return `${value.toFixed(3)}px`;
}

function isVisibleHttpsUrl(pageUrl: string, showUrl: boolean): boolean {
  if (!showUrl || !pageUrl) return false;

  try {
    return new URL(pageUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

export function BrowserFrame({
  children,
  style,
  scale,
  barHeight,
  addressHeight,
  pageUrl,
  showUrl,
}: BrowserFrameProps): React.JSX.Element {
  const dotSize = Math.max(7, 11 * scale);
  const dotGap = Math.max(5, 8 * scale);
  const barPadding = Math.max(10, 18 * scale);
  const fontSize = Math.max(10, Math.min(16, 13 * scale));
  const hasVisibleUrl = showUrl && Boolean(pageUrl);
  const secureUrl = isVisibleHttpsUrl(pageUrl, showUrl);

  return (
    <section
      className="composition-browser-frame composition-frame-shadow"
      style={style}
    >
      <header
        className="composition-browser-bar"
        style={{
          height: px(barHeight),
          padding: `0 ${px(barPadding)}`,
        }}
        aria-hidden="true"
      >
        <span
          className="composition-traffic"
          style={{ gap: px(dotGap) }}
        >
          <i style={{ width: px(dotSize), height: px(dotSize) }} />
          <i style={{ width: px(dotSize), height: px(dotSize) }} />
          <i style={{ width: px(dotSize), height: px(dotSize) }} />
        </span>
        <span
          className="composition-address"
          style={{
            height: px(addressHeight),
            fontSize: px(fontSize),
          }}
        >
          {secureUrl ? (
            <LockIcon
              className="composition-address-icon is-secure"
              data-address-icon="lock"
            />
          ) : (
            <GlobeIcon
              className="composition-address-icon is-neutral"
              data-address-icon="globe"
            />
          )}
          <span>
            {hasVisibleUrl ? formatUrlForFrame(pageUrl) : 'Captured page'}
          </span>
        </span>
        <span className="composition-browser-actions">
          <i /><i /><i />
        </span>
      </header>
      {children}
    </section>
  );
}
