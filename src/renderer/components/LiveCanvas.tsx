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
  roundRectangleEdges,
} from '@shared/layout';
import type {
  CaptureSettings,
  TargetViewLayout,
} from '@shared/types';
import {
  CompositionCanvas,
  type TargetSuspensionReason,
} from './CompositionCanvas';

interface LiveCanvasProps {
  settings: CaptureSettings;
  pageUrl: string;
  pageLoading: boolean;
  targetSuspensionReason: TargetSuspensionReason | null;
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

export function LiveCanvas({
  settings,
  pageUrl,
  pageLoading,
  targetSuspensionReason,
  onTargetLayout,
}: LiveCanvasProps): React.JSX.Element {
  const containerRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const lastLayoutRef = useRef('');
  const [containerSize, setContainerSize] = useState<Size>({
    width: 900,
    height: 620,
  });

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
    () =>
      calculatePreviewCanvasSize(
        containerSize.width,
        containerSize.height,
        settings.outputWidth,
        settings.outputHeight,
        0,
      ),
    [containerSize, settings.outputHeight, settings.outputWidth],
  );
  const layout = useMemo(
    () => calculateCompositionLayout(settings),
    [settings],
  );

  const publishLayout = useCallback(() => {
    const viewport = {
      width: settings.viewportWidth,
      height: settings.viewportHeight,
      mode: settings.deviceMode,
    } as const;
    if (
      !pageUrl ||
      targetSuspensionReason !== null ||
      document.visibilityState === 'hidden' ||
      !targetRef.current
    ) {
      const hiddenLayout: TargetViewLayout = {
        ...HIDDEN_LAYOUT_BASE,
        viewport,
      };
      const key = JSON.stringify(hiddenLayout);
      if (key !== lastLayoutRef.current) {
        lastLayoutRef.current = key;
        onTargetLayout(hiddenLayout);
      }
      return;
    }

    const rect = targetRef.current.getBoundingClientRect();
    const bounds = roundRectangleEdges(rect);
    const next: TargetViewLayout = {
      ...bounds,
      borderRadius: Math.max(
        0,
        Math.round(layout.screen.radius * preview.scale),
      ),
      visible: true,
      viewport,
    };
    const key = JSON.stringify(next);
    if (key !== lastLayoutRef.current) {
      lastLayoutRef.current = key;
      onTargetLayout(next);
    }
  }, [
    layout.screen.radius,
    onTargetLayout,
    pageUrl,
    preview.scale,
    settings.deviceMode,
    settings.viewportHeight,
    settings.viewportWidth,
    targetSuspensionReason,
  ]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(publishLayout);
    return () => cancelAnimationFrame(frame);
  }, [publishLayout, preview.height, preview.width]);

  useEffect(() => {
    const observer = new ResizeObserver(publishLayout);
    if (targetRef.current) observer.observe(targetRef.current);
    if (canvasRef.current) observer.observe(canvasRef.current);
    window.addEventListener('resize', publishLayout);
    document.addEventListener('visibilitychange', publishLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publishLayout);
      document.removeEventListener('visibilitychange', publishLayout);
    };
  }, [publishLayout]);

  const canvasStyle: CSSProperties = {
    transform: `scale(${preview.scale})`,
    transformOrigin: 'top left',
  };

  return (
    <section className="canvas-shell" ref={containerRef}>
      <div
        className="composition-preview-frame"
        style={{ width: preview.width, height: preview.height }}
      >
        <CompositionCanvas
          settings={settings}
          pageUrl={pageUrl}
          pageLoading={pageLoading}
          pageSuspensionReason={targetSuspensionReason ?? undefined}
          slotMode="live"
          canvasRef={canvasRef}
          targetRef={targetRef}
          style={canvasStyle}
        />
      </div>
    </section>
  );
}
