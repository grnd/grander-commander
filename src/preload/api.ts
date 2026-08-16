// src/preload/api.ts
//
// GCApi is defined once in @shared/api so the renderer's ambient window.gc
// declaration and the preload implementation cannot drift apart.
export type { GCApi } from '@shared/api';

declare global {
  interface Window {
    gc: import('@shared/api').GCApi;
  }
}
