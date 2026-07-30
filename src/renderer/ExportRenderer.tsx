import { useEffect, useRef, useState } from 'react';
import { validateCaptureSettings } from '@shared/validation';
import type { ExportRenderPayload } from '@shared/types';
import { CompositionCanvas } from './components/CompositionCanvas';

interface PendingRender {
  resolve: (ready: boolean) => void;
  reject: (error: unknown) => void;
}

async function waitForCanvas(): Promise<void> {
  const image = document.getElementById('page-image');
  if (!(image instanceof HTMLImageElement)) {
    throw new Error('合成対象のページ画像がありません。');
  }
  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener(
        'error',
        () => reject(new Error('ページ画像を読み込めませんでした。')),
        { once: true },
      );
    });
  }
  if (image.naturalWidth === 0 || image.naturalHeight === 0) {
    throw new Error('ページ画像を読み込めませんでした。');
  }
  if (document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => window.setTimeout(resolve, 3000)),
    ]);
  }
  await Promise.race([
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    ),
    new Promise((resolve) => window.setTimeout(resolve, 250)),
  ]);
}

function validatePayload(value: ExportRenderPayload): ExportRenderPayload {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.pageImageUrl !== 'string' ||
    !value.pageImageUrl.startsWith('frameshot-export://capture/') ||
    typeof value.targetUrl !== 'string'
  ) {
    throw new Error('書き出しデータが不正です。');
  }
  return {
    settings: validateCaptureSettings(value.settings),
    pageImageUrl: value.pageImageUrl,
    targetUrl: value.targetUrl,
  };
}

export function ExportRenderer(): React.JSX.Element | null {
  const [payload, setPayload] = useState<ExportRenderPayload | null>(null);
  const pendingRef = useRef<PendingRender | null>(null);

  useEffect(() => {
    window.frameShotRenderExport = (value) => {
      try {
        const next = validatePayload(value);
        return new Promise<boolean>((resolve, reject) => {
          pendingRef.current?.reject(
            new Error('書き出しデータが置き換えられました。'),
          );
          pendingRef.current = { resolve, reject };
          setPayload(next);
        });
      } catch (error) {
        return Promise.reject(error);
      }
    };
    return () => {
      delete window.frameShotRenderExport;
      pendingRef.current?.reject(
        new Error('書き出し画面が終了しました。'),
      );
      pendingRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!payload || !pendingRef.current) return;
    let active = true;
    void waitForCanvas()
      .then(() => {
        if (!active) return;
        pendingRef.current?.resolve(true);
        pendingRef.current = null;
      })
      .catch((error) => {
        if (!active) return;
        pendingRef.current?.reject(error);
        pendingRef.current = null;
      });
    return () => {
      active = false;
    };
  }, [payload]);

  if (!payload) return null;
  return (
    <CompositionCanvas
      settings={payload.settings}
      pageUrl={payload.targetUrl}
      slotMode="image"
      pageImageUrl={payload.pageImageUrl}
    />
  );
}
