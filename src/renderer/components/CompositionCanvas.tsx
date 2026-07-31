import type { CSSProperties, Ref } from 'react';
import {
  calculateCompositionLayout,
  shadowCss,
} from '@shared/layout';
import { formatUrlForFrame } from '@shared/url';
import type { CaptureSettings } from '@shared/types';
import {
  backgroundClassName,
  backgroundCssProperties,
} from '../background';
import { GlobeIcon } from './Icons';

export type CompositionSlotMode = 'live' | 'image';

interface CompositionCanvasProps {
  settings: CaptureSettings;
  pageUrl: string;
  pageLoading?: boolean;
  pageSuspended?: boolean;
  slotMode: CompositionSlotMode;
  pageImageUrl?: string;
  canvasRef?: Ref<HTMLDivElement>;
  targetRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
}

function px(value: number): string {
  return `${value.toFixed(3)}px`;
}

export function CompositionCanvas({
  settings,
  pageUrl,
  pageLoading = false,
  pageSuspended = false,
  slotMode,
  pageImageUrl,
  canvasRef,
  targetRef,
  style,
}: CompositionCanvasProps): React.JSX.Element {
  const layout = calculateCompositionLayout(settings);
  const frameStyle: CSSProperties = {
    left: px(layout.frame.x),
    top: px(layout.frame.y),
    width: px(layout.frame.width),
    height: px(layout.frame.height),
    borderRadius: px(layout.frame.radius),
    boxShadow: shadowCss(settings.shadow),
  };
  const screenStyle: CSSProperties = {
    left: px(layout.screen.x - layout.frame.x),
    top: px(layout.screen.y - layout.frame.y),
    width: px(layout.screen.width),
    height: px(layout.screen.height),
    borderRadius: px(layout.screen.radius),
  };
  const dotSize = Math.max(7, 11 * layout.scale);
  const dotGap = Math.max(5, 8 * layout.scale);
  const barPadding = Math.max(10, 18 * layout.scale);
  const fontSize = Math.max(10, Math.min(16, 13 * layout.scale));
  const tabletCameraSize = 8 * layout.scale;

  const pageSlot = (
    <div
      ref={targetRef}
      className={`composition-page-slot ${pageLoading ? 'is-loading' : ''} ${pageSuspended && pageUrl ? 'is-suspended' : ''}`}
      style={screenStyle}
      data-slot-mode={slotMode}
      aria-label="対象Webページの表示領域"
    >
      {slotMode === 'image' ? (
        <img
          id="page-image"
          className="composition-page-image"
          src={pageImageUrl}
          alt="Captured page"
          draggable={false}
        />
      ) : pageSuspended && pageUrl ? (
        <div className="target-suspended-placeholder">
          <strong>設定を編集中</strong>
          <span>ライブページは一時的に非表示です</span>
        </div>
      ) : !pageUrl ? (
        <div className="empty-target">
          <GlobeIcon />
          <strong>URLを入力してページを開く</strong>
          <span>localhost・LAN内・公開URLに対応</span>
        </div>
      ) : (
        <div className="target-loading-placeholder">
          <span className="loading-shimmer" />
          <small>{pageLoading ? 'Loading page…' : 'Interactive page'}</small>
        </div>
      )}
    </div>
  );

  const frame = settings.frameStyle === 'browser' ? (
    <section
      className="composition-browser-frame composition-frame-shadow"
      style={frameStyle}
    >
      <header
        className="composition-browser-bar"
        style={{
          height: px(layout.browserBarHeight),
          padding: `0 ${px(barPadding)}`,
        }}
      >
        <span
          className="composition-traffic"
          style={{ gap: px(dotGap) }}
          aria-hidden="true"
        >
          <i style={{ width: px(dotSize), height: px(dotSize) }} />
          <i style={{ width: px(dotSize), height: px(dotSize) }} />
          <i style={{ width: px(dotSize), height: px(dotSize) }} />
        </span>
        <span
          className="composition-address"
          style={{
            height: px(layout.browserAddressHeight),
            fontSize: px(fontSize),
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 10V8a5 5 0 0 1 10 0v2h1.2A1.8 1.8 0 0 1 20 11.8v7.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19.2v-7.4A1.8 1.8 0 0 1 5.8 10H7Zm2 0h6V8a3 3 0 0 0-6 0v2Z" />
          </svg>
          <span>
            {settings.showUrl && pageUrl
              ? formatUrlForFrame(pageUrl)
              : 'Captured page'}
          </span>
        </span>
        <span className="composition-browser-actions" aria-hidden="true">
          <i /><i /><i />
        </span>
      </header>
      {pageSlot}
    </section>
  ) : settings.frameStyle === 'phone' ? (
    <section
      className="composition-phone-frame composition-frame-shadow"
      style={frameStyle}
    >
      <span className="composition-phone-highlight" />
      <span
        className="composition-phone-island"
        style={{
          width: px(Math.min(layout.screen.width * 0.34, 126 * layout.scale)),
          height: px(Math.max(12, 28 * layout.scale)),
          top: px(Math.max(10, layout.phoneBezel.top * 0.34)),
        }}
      />
      {pageSlot}
      <span
        className="composition-phone-home"
        style={{
          bottom: px(Math.max(9, layout.phoneBezel.bottom * 0.38)),
          width: px(Math.min(layout.screen.width * 0.32, 116 * layout.scale)),
        }}
      />
    </section>
  ) : settings.frameStyle === 'tablet' ? (
    <section
      className="composition-tablet-frame composition-frame-shadow"
      style={frameStyle}
    >
      <span className="composition-tablet-highlight" />
      <span
        className="composition-tablet-camera"
        style={{
          width: px(tabletCameraSize),
          height: px(tabletCameraSize),
          top: px(
            Math.max(0, (layout.tabletBezel.top - tabletCameraSize) / 2),
          ),
        }}
      />
      {pageSlot}
    </section>
  ) : (
    <section
      className="composition-plain-frame composition-frame-shadow"
      style={frameStyle}
    >
      {pageSlot}
    </section>
  );

  return (
    <div
      ref={canvasRef}
      className={`composition-canvas ${backgroundClassName(settings.backgroundStyle)}`}
      style={{
        width: settings.outputWidth,
        height: settings.outputHeight,
        ...backgroundCssProperties(settings),
        ...style,
      }}
      data-frame-style={settings.frameStyle}
    >
      <span className="composition-glow glow-a" />
      <span className="composition-glow glow-b" />
      <span className="composition-grain" />
      {frame}
    </div>
  );
}
