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
  const phoneButtonThickness = 3 * layout.scale;

  const phoneButtonStyle = (
    side: 'left' | 'right',
    top: number,
    height: number,
  ): CSSProperties => ({
    [side]: px(2 * layout.scale),
    top: px(top * layout.scale),
    width: px(phoneButtonThickness),
    height: px(height * layout.scale),
  });

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
      className={`composition-phone-frame composition-phone-${settings.phoneFrameVariant} composition-frame-shadow`}
      style={frameStyle}
      data-phone-frame-variant={settings.phoneFrameVariant}
    >
      <span className="composition-phone-rail" aria-hidden="true" />
      <span className="composition-phone-highlight" aria-hidden="true" />
      {settings.phoneFrameVariant === 'android' ? (
        <>
          <span
            className="composition-phone-button is-android-volume"
            style={phoneButtonStyle('right', 120, 70)}
            aria-hidden="true"
          />
          <span
            className="composition-phone-button is-android-power"
            style={phoneButtonStyle('right', 210, 54)}
            aria-hidden="true"
          />
        </>
      ) : (
        <>
          <span
            className="composition-phone-button is-iphone-action"
            style={phoneButtonStyle('left', 110, 30)}
            aria-hidden="true"
          />
          <span
            className="composition-phone-button is-iphone-volume-up"
            style={phoneButtonStyle('left', 154, 55)}
            aria-hidden="true"
          />
          <span
            className="composition-phone-button is-iphone-volume-down"
            style={phoneButtonStyle('left', 222, 55)}
            aria-hidden="true"
          />
          <span
            className="composition-phone-button is-iphone-power"
            style={phoneButtonStyle('right', 190, 92)}
            aria-hidden="true"
          />
        </>
      )}
      {pageSlot}
      {slotMode === 'image' &&
        (settings.phoneFrameVariant === 'iphone' ? (
          <span
            className="composition-phone-island"
            style={{
              width: px(124 * layout.scale),
              height: px(32 * layout.scale),
              top: px(layout.phoneBezel.top + 12 * layout.scale),
            }}
            aria-hidden="true"
          />
        ) : (
          <span
            className="composition-phone-camera"
            style={{
              width: px(10 * layout.scale),
              height: px(10 * layout.scale),
              top: px(layout.phoneBezel.top + 10 * layout.scale),
            }}
            aria-hidden="true"
          />
        ))}
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
