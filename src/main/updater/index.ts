import { app, BrowserWindow } from 'electron';
// electron-updater is CommonJS while the main bundle is ESM, so `autoUpdater`
// is not available as a named export — it has to come off the default export.
// Importing it the obvious way fails at load with a SyntaxError.
import electronUpdater, { type AppUpdater } from 'electron-updater';
import type { UpdateStatus } from '@shared/types';

const { autoUpdater } = electronUpdater as unknown as { autoUpdater: AppUpdater };
import { DEFAULT_REPO, latestFeedUrl, tagFeedUrl, tagFromLatestRedirect } from './feed';

let initialized = false;
let current: UpdateStatus = { kind: 'idle' };

function broadcast(status: UpdateStatus): void {
  current = status;
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.webContents.isDestroyed()) w.webContents.send('update:status', status);
  }
}

export function getUpdateStatus(): UpdateStatus {
  return current;
}

/**
 * Resolve what /releases/latest currently points at, so the feed can be pinned
 * to that exact tag. Returns null on any failure — the caller falls back to the
 * unpinned /latest feed rather than failing the check outright.
 */
async function resolveLatestTag(repo: string): Promise<string | null> {
  try {
    const res = await fetch(`https://github.com/${repo}/releases/latest`, {
      method: 'HEAD',
      redirect: 'manual',
    });
    const direct = tagFromLatestRedirect(res.headers.get('location'));
    if (direct) return direct;
    // Some runtimes follow the redirect anyway; res.url is then the tag URL.
    return tagFromLatestRedirect(res.url);
  } catch {
    return null;
  }
}

function wireHandlers(): void {
  autoUpdater.on('update-available', (info) => {
    broadcast({ kind: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    broadcast({ kind: 'up-to-date', checkedAt: Date.now() });
  });
  autoUpdater.on('download-progress', (p) => {
    broadcast({ kind: 'downloading', percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ kind: 'ready', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    broadcast({ kind: 'error', message: err?.message ?? String(err) });
  });
}

export function initUpdater(): void {
  if (initialized) return;
  initialized = true;
  // Downloading is an explicit user choice; a file manager should not spend
  // someone's bandwidth on startup.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m: unknown) => console.info('[updater]', m),
    warn: (m: unknown) => console.warn('[updater]', m),
    error: (m: unknown) => console.error('[updater]', m),
    debug: () => {},
  } as never;
  wireHandlers();
}

export async function checkForUpdates(repo: string = DEFAULT_REPO): Promise<UpdateStatus> {
  // electron-updater throws without a dev-app-update.yml, and an unpackaged
  // build has no signature for Squirrel to validate against anyway.
  if (!app.isPackaged) {
    broadcast({ kind: 'unsupported', reason: 'Updates are disabled in development builds.' });
    return current;
  }
  initUpdater();
  broadcast({ kind: 'checking' });

  // Pin to a concrete tag so a release published between the check and the
  // download cannot make the two disagree. Unpinned /latest is the fallback.
  const tag = await resolveLatestTag(repo);
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: tag ? tagFeedUrl(tag, repo) : latestFeedUrl(repo),
  });

  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    broadcast({ kind: 'error', message: (err as Error)?.message ?? String(err) });
  }
  return current;
}

export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged) return;
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    broadcast({ kind: 'error', message: (err as Error)?.message ?? String(err) });
  }
}

export function quitAndInstall(): void {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall();
}
