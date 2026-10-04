import { app, type BrowserWindow } from 'electron';

/**
 * `GC_SMOKE=1` turns a launch into a self-check: load the window, confirm the
 * preload bridge and the React root are really there, print a marker and exit.
 *
 * v0.1.2 and v0.1.6 both shipped an app that opened to a blank window, and
 * both would have been caught by starting the packaged build once. The check
 * lives inside the app on purpose — the artifact under test is signed,
 * hardened and notarized, which is the worst case for attaching a debugger
 * from outside, while the app inspecting its own renderer always works.
 */
export const SMOKE_OK = 'GC_SMOKE_OK';
export const SMOKE_FAIL = 'GC_SMOKE_FAIL';

/** The renderer mounts asynchronously; loadFile resolving is not enough. */
const ATTEMPTS = 40;
const INTERVAL_MS = 250;

const PROBE = 'Boolean(window.gc && window.gc.fs) && Boolean(document.querySelector(".gc-app"))';

export function isSmokeRun(): boolean {
  return process.env.GC_SMOKE === '1';
}

export async function runSmokeCheck(win: BrowserWindow): Promise<void> {
  let lastError = 'window.gc or .gc-app never appeared';
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      if (await win.webContents.executeJavaScript(PROBE)) {
        console.log(SMOKE_OK);
        app.exit(0);
        return;
      }
    } catch (err) {
      lastError = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  console.log(`${SMOKE_FAIL}: ${lastError}`);
  app.exit(1);
}
