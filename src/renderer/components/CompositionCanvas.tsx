import type { CSSProperties, Ref } from 'react';
import {
  calculateCompositionLayout,
  shadowCss,
} from '@shared/layout';
import type { CaptureSettings } from '@shared/types';
import {
  backgroundClassName,
  backgroundCssProperties,
} from '../background';
import { BrowserFrame } from './BrowserFrame';
import { GlobeIcon } from './Icons';
import '../background.css';
import './CompositionCanvas.css';

export type CompositionSlotMode = 'live' | 'image';
export type TargetSuspensionReason = 'settings' | 'viewport-menu';

interface CompositionCanvasProps {
  settings: CaptureSettings;
  pageUrl: string;
  pageLoading?: boolean;
  pageSuspensionReason?: TargetSuspensionReason;
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
  pageSuspensionReason,
  slotMode,
  pageImageUrl,
  canvasRef,
  targetRef,
  style,
}: CompositionCanvasProps): React.JSX.Element {
  const layout = calculateCompositionLayout(settings);
  const frameStyle: CSSProperties = {
    left: px(layout.frame.x - layout.artboard.x),
    top: px(layout.frame.y - layout.artboard.y),
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
  const tabletCameraSize = 8 * layout.scale;

  const pageSlot = (
    <div
      ref={targetRef}
      className={`composition-page-slot ${pageLoading ? 'is-loading' : ''} ${pageSuspensionReason && pageUrl ? 'is-suspended' : ''}`}
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
      ) : pageSuspensionReason && pageUrl ? (
        <div className="target-suspended-placeholder">
          <strong>
            {pageSuspensionReason === 'viewport-menu'
              ? 'サイズプリセットを選択中'
              : '設定を編集中'}
          </strong>
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
    <BrowserFrame
      style={frameStyle}
      scale={layout.scale}
      barHeight={layout.browserBarHeight}
      addressHeight={layout.browserAddressHeight}
      pageUrl={pageUrl}
      showUrl={settings.showUrl}
    >
      {pageSlot}
    </BrowserFrame>
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
      className="composition-canvas"
      style={{
        width: settings.outputWidth,
        height: settings.outputHeight,
        ...style,
      }}
      data-frame-style={settings.frameStyle}
    >
      <div
        className={`composition-artboard ${backgroundClassName(settings.backgroundStyle)}`}
        style={{
          left: layout.artboard.x,
          top: layout.artboard.y,
          width: layout.artboard.width,
          height: layout.artboard.height,
          ...backgroundCssProperties(settings),
        }}
        data-artboard-width={layout.artboard.width}
        data-artboard-height={layout.artboard.height}
      >
        <span className="composition-glow glow-a" />
        <span className="composition-glow glow-b" />
        <span className="composition-grain" />
        {frame}
      </div>
    </div>
  );
}
