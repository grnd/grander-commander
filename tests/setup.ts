import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Node 26 ships its own `localStorage` global that stays undefined unless the
 * process is started with `--localstorage-file`, and it shadows the one jsdom
 * puts on the window. Every test that touches persisted state then dies on
 * `localStorage.clear()`. A minimal in-memory Storage restores them without
 * making the suite depend on a Node flag.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const storage = {
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(String(k)) ?? null,
    setItem: (k: string, v: string) => { store.set(String(k), String(v)); },
    removeItem: (k: string) => { store.delete(String(k)); },
    clear: () => { store.clear(); },
  } as Storage;
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}

afterEach(() => {
  cleanup();
});
