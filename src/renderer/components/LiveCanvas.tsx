import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  calculateCompositionLayout,
  calculatePreviewCanvasSize,
  shadowCss,
} from '@shared/layout';
import { formatUrlForFrame } from '@shared/url';
import type {
  AppMode,
  CaptureResult,
  CaptureSettings,
  TargetViewLayout,
} from '@shared/types';
import { CameraIcon, GlobeIcon, SparklesIcon } from './Icons';

interface LiveCanvasProps {
  mode: AppMode;
  settings: CaptureSettings;
  capture: CaptureResult | null;
  pageUrl: string;
  pageLoading: boolean;
  needsRecompose: boolean;
  onTargetLayout: (layout: TargetViewLayout) => void;
}

interface Size {
  width: number;
  height: number;
}

const HIDDEN_LAYOUT_BASE = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  borderRadius: 0,
  visible: false,
} as const;

function numericStyle(value: number): string {
  return `${value.toFixed(2)}px`;
}

export function LiveCanvas({
  mode,
  settings,
  capture,
  pageUrl,
  pageLoading,
  needsRecompose,
  onTargetLayout,
}: LiveCanvasProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const lastLayoutRef = useRef('');
  const [containerSize, setContainerSize] = useState<Size>({ width: 900, height: 620 });

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const preview = useMemo(
    () => calculatePreviewCanvasSize(
      containerSize.width,
      containerSize.height,
      settings.outputWidth,
      settings.outputHeight,
      0,
    ),
    [containerSize, settings.outputHeight, settings.outputWidth],
  );
  const layout = useMemo(() => calculateCompositionLayout(settings), [settings]);
  const targetBorderRadius = layout.screen.radius * preview.scale;

  const publishLayout = useCallback(() => {
    const viewport = {
      width: settings.viewportWidth,
      height: settings.viewportHeight,
      mode: settings.deviceMode,
    } as const;

    if (
      mode !== 'live' ||
      !pageUrl ||
      document.visibilityState === 'hidden' ||
      !targetRef.current
    ) {
      const hiddenLayout: TargetViewLayout = { ...HIDDEN_LAYOUT_BASE, viewport };
      const key = JSON.stringify(hiddenLayout);
      if (key !== lastLayoutRef.current) {
        lastLayoutRef.current = key;
        onTargetLayout(hiddenLayout);
      }
      return;
    }

    const rect = targetRef.current.getBoundingClientRect();
    const next: TargetViewLayout = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      borderRadius: Math.max(0, Math.round(targetBorderRadius)),
      visible: true,
      viewport,
    };
    const key = JSON.stringify(next);
    if (key !== lastLayoutRef.current) {
      lastLayoutRef.current = key;
      onTargetLayout(next);
    }
  }, [
    mode,
    onTargetLayout,
    pageUrl,
    settings.deviceMode,
    settings.viewportHeight,
    settings.viewportWidth,
    targetBorderRadius,
  ]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(publishLayout);
    return () => cancelAnimationFrame(frame);
  }, [publishLayout, preview.height, preview.width]);

  useEffect(() => {
    const target = targetRef.current;
    const stage = stageRef.current;
    if (!target && !stage) return;
    const observer = new ResizeObserver(() => publishLayout());
    if (target) observer.observe(target);
    if (stage) observer.observe(stage);
    window.addEventListener('resize', publishLayout);
    document.addEventListener('visibilitychange', publishLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publishLayout);
      document.removeEventListener('visibilitychange', publishLayout);
    };
  }, [mode, publishLayout]);

  const stageStyle: CSSProperties = {
    width: preview.width,
    height: preview.height,
    background: `linear-gradient(${settings.gradientAngle}deg, ${settings.gradientFrom}, ${settings.gradientTo})`,
  };
  const scale = preview.scale;
  const frameStyle: CSSProperties = {
    left: numericStyle(layout.frame.x * scale),
    top: numericStyle(layout.frame.y * scale),
    width: numericStyle(layout.frame.width * scale),
    height: numericStyle(layout.frame.height * scale),
    borderRadius: numericStyle(layout.frame.radius * scale),
    boxShadow: shadowCss(settings.shadow),
  };
  const screenStyle: CSSProperties = {
    left: numericStyle((layout.screen.x - layout.frame.x) * scale),
    top: numericStyle((layout.screen.y - layout.frame.y) * scale),
    width: numericStyle(layout.screen.width * scale),
    height: numericStyle(layout.screen.height * scale),
    borderRadius: numericStyle(layout.screen.radius * scale),
  };

  const targetSlot = (
    <div
      ref={targetRef}
      className={`target-slot ${pageLoading ? 'is-loading' : ''}`}
      style={screenStyle}
      aria-label="対象Webページの表示領域"
    >
      {!pageUrl ? (
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

  const liveFrame = settings.frameStyle === 'browser' ? (
    <div className="live-browser-frame" style={frameStyle}>
      <div
        className="live-browser-bar"
        style={{ height: numericStyle(layout.browserBarHeight * scale) }}
      >
        <span className="live-traffic"><i /><i /><i /></span>
        <span
          className="live-address"
          style={{
            height: numericStyle(layout.browserAddressHeight * scale),
            alignSelf: 'center',
            lineHeight: 1,
          }}
        >
          <span className="address-lock">◆</span>
          {settings.showUrl && pageUrl ? formatUrlForFrame(pageUrl) : 'Captured page'}
        </span>
        <span className="live-menu">•••</span>
      </div>
      {targetSlot}
    </div>
  ) : settings.frameStyle === 'phone' ? (
    <div className="live-phone-frame" style={frameStyle}>
      <span className="live-phone-highlight" />
      <span
        className="live-phone-island"
        style={{
          width: numericStyle(Math.min(layout.screen.width * 0.34, 126 * layout.scale) * scale),
          height: numericStyle(Math.max(12, 28 * layout.scale) * scale),
          top: numericStyle(Math.max(10, layout.phoneBezel.top * 0.34) * scale),
        }}
      />
      {targetSlot}
      <span
        className="live-phone-home"
        style={{
          bottom: numericStyle(Math.max(9, layout.phoneBezel.bottom * 0.38) * scale),
          width: numericStyle(Math.min(layout.screen.width * 0.32, 116 * layout.scale) * scale),
        }}
      />
    </div>
  ) : (
    <div className="live-plain-frame" style={frameStyle}>{targetSlot}</div>
  );

  return (
    <section className="canvas-shell" ref={containerRef}>
      <div
        ref={stageRef}
        className={`capture-stage background-${settings.backgroundStyle}`}
        style={stageStyle}
      >
        <span className="stage-glow glow-a" />
        <span className="stage-glow glow-b" />
        <span className="stage-grain" />

        {mode === 'preview' ? (
          capture ? (
            <>
              <img
                className="final-preview-image"
                src={capture.dataUrl}
                alt="完成したスクリーンショット"
                draggable={false}
              />
              {needsRecompose && (
                <span className="stale-preview-badge">
                  <SparklesIcon /> 設定変更あり
                </span>
              )}
            </>
          ) : (
            <div className="empty-preview">
              <CameraIcon />
              <strong>まだ撮影されていません</strong>
              <span>「操作」で画面を整えて、撮影ボタンを押してください。</span>
            </div>
          )
        ) : liveFrame}
      </div>
      <footer className="canvas-caption">
        <span>{mode === 'live' ? 'LIVE · ページを直接操作できます' : 'OUTPUT PREVIEW · PNGと同じ構図'}</span>
        <span>{settings.viewportWidth} × {settings.viewportHeight} → {settings.outputWidth} × {settings.outputHeight}</span>
      </footer>
    </section>
  );
}
