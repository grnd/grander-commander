import type { GCApi } from '@shared/api';

declare global {
  interface Window { gc: GCApi }
}

export {};
