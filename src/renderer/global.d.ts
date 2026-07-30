import type { ExportRenderPayload, FrameShotApi } from '@shared/types';

declare global {
  interface Window {
    frameShot: FrameShotApi;
    frameShotRenderExport?: (
      payload: ExportRenderPayload,
    ) => Promise<boolean>;
  }
}

export {};
