import type { FrameShotApi } from '@shared/types';

declare global {
  interface Window {
    frameShot: FrameShotApi;
  }
}

export {};
