// src/main/shell/dragOut.ts
import { nativeImage, type WebContents } from 'electron';
import { existsSync } from 'node:fs';

/**
 * A real 32x32 document glyph. `startDrag` rejects an empty or malformed icon,
 * and a rejected drag session does not fail loudly — it produces a garbage drop
 * on the other end, which is exactly what a 1x1 transparent placeholder gave.
 */
const DRAG_ICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAUElEQVR42u3XIRIAEBRFUeuUVFsT'
  + 'LcCSjKAzAiP+gC/cO/P6qc8Y+i3rfLs5ESCXemwhpjUVwI5QA0yEKmAMAAAAAAAAAAAAAAAxQPWY'
  + '0Os6ItGn+cKa7TMAAAAASUVORK5CYII=',
  'base64',
);

let cachedIcon: Electron.NativeImage | null = null;

function dragIcon(): Electron.NativeImage {
  if (!cachedIcon) cachedIcon = nativeImage.createFromBuffer(DRAG_ICON_PNG);
  return cachedIcon;
}

/**
 * Hand a set of files to the OS drag session so they can be dropped into
 * Finder or any other app.
 *
 * Everything here is synchronous on purpose. startDrag has to run while the
 * platform drag gesture is still live; the renderer already spends one IPC
 * round trip getting here, and awaiting anything else (an fs.access per path,
 * say) let the gesture lapse and produced a dropped file named after the
 * source path.
 *
 * Electron takes the drag over completely once this is called, which is why
 * the renderer only reaches for it on an explicit Alt-drag — an HTML5 drag
 * between the two panels cannot coexist with it.
 */
export function startDrag(sender: WebContents, paths: string[]): void {
  // A path that vanished between selection and drag crashes the drag session
  // on some macOS versions.
  const existing = paths.filter((p) => existsSync(p));
  if (existing.length === 0) return;

  sender.startDrag({
    // `file` is what a single-item drag uses; `files` supersedes it for many.
    // Passing both with one path made some drops fall back to the wrong one.
    ...(existing.length === 1 ? { file: existing[0] } : { file: existing[0], files: existing }),
    icon: dragIcon(),
  });
}
