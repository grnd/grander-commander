import { watch, type FSWatcher } from 'node:fs';
import type { WebContents } from 'electron';

export type Side = 'left' | 'right';

type WatchEntry = {
  path: string;
  watcher: FSWatcher;
  timer: NodeJS.Timeout | null;
};

const DEBOUNCE_MS = 150;

const registry = new Map<WebContents, Map<Side, WatchEntry>>();

function closeEntry(entry: WatchEntry): void {
  if (entry.timer) clearTimeout(entry.timer);
  try { entry.watcher.close(); } catch { /* already closed */ }
}

export function watchDir(wc: WebContents, side: Side, path: string): void {
  let sides = registry.get(wc);
  const existing = sides?.get(side);
  if (existing && existing.path === path) return;
  if (existing) {
    closeEntry(existing);
    sides!.delete(side);
  }

  let watcher: FSWatcher;
  try {
    watcher = watch(path, { persistent: false, recursive: false });
  } catch {
    // Path missing or not watchable — leave no entry. User can Ctrl+R.
    return;
  }

  const entry: WatchEntry = { path, watcher, timer: null };

  watcher.on('change', () => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (wc.isDestroyed()) return;
      wc.send('fs:dirChanged', { side, path });
    }, DEBOUNCE_MS);
  });

  watcher.on('error', () => {
    const s = registry.get(wc);
    const cur = s?.get(side);
    if (cur === entry) {
      closeEntry(entry);
      s!.delete(side);
      if (s!.size === 0) registry.delete(wc);
    }
  });

  if (!sides) {
    sides = new Map();
    registry.set(wc, sides);
  }
  sides.set(side, entry);
}

export function unwatchDir(wc: WebContents, side: Side): void {
  const sides = registry.get(wc);
  const entry = sides?.get(side);
  if (!entry) return;
  closeEntry(entry);
  sides!.delete(side);
  if (sides!.size === 0) registry.delete(wc);
}

export function unwatchAllForContents(wc: WebContents): void {
  const sides = registry.get(wc);
  if (!sides) return;
  for (const entry of sides.values()) closeEntry(entry);
  registry.delete(wc);
}
