import { execFile } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Finder's icon, straight out of the running system.
 *
 * Not `app.getFileIcon('.../Finder.app')`: on this macOS that hands back the
 * generic application placeholder rather than Finder's own artwork. Not
 * `nativeImage.createFromPath` on the .icns either — Electron's loader returns
 * an empty image for it. `sips` is the one reader that gets it right, and it
 * ships with macOS.
 */
const FINDER_ICNS = '/System/Library/CoreServices/Finder.app/Contents/Resources/Finder.icns';

/**
 * Resolved once per run. `undefined` means "not looked up yet"; `null` means
 * "looked up and there is none", which must not retry on every window.
 */
let cached: string | null | undefined;

/** 64px for a 14px chip, so it stays sharp at any display scale. */
const PIXELS = '64';

async function convert(): Promise<string | null> {
  const out = join(tmpdir(), `gc-finder-icon-${process.pid}.png`);
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'sips',
        ['-s', 'format', 'png', '-Z', PIXELS, FINDER_ICNS, '--out', out],
        (err) => (err ? reject(err) : resolve()),
      );
    });
    return `data:image/png;base64,${(await readFile(out)).toString('base64')}`;
  } catch {
    // A future macOS that moves the icon, or drops sips, keeps the glyph.
    return null;
  } finally {
    await unlink(out).catch(() => {});
  }
}

/**
 * Finder's own icon as a data URL, or null when the system has none to give.
 *
 * Read at runtime rather than committed to the repo: the artwork is Apple's,
 * and it has changed with almost every macOS release, so a bundled copy would
 * be wrong on half the versions this runs on.
 */
export async function finderIcon(): Promise<string | null> {
  if (cached === undefined) cached = await convert();
  return cached;
}
