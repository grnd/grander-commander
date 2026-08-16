// src/main/shell/dragOut.ts
import { nativeImage, type WebContents } from 'electron';
import { access } from 'node:fs/promises';

/**
 * A 1x1 transparent PNG. `startDrag` insists on an icon, and macOS draws its
 * own file badge over whatever is supplied, so a placeholder is honest here.
 */
const DRAG_ICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAHElEQVR42mNkoBAwjhow'
  + 'asCoAaMGjBowasCoAQADAAKgAAGGKvGaAAAAAElFTkSuQmCC',
  'base64',
);

/**
 * Hand a set of files to the OS drag session so they can be dropped into
 * Finder or any other app. Electron takes over the drag once this is called,
 * which is why the renderer only reaches for it on an explicit Alt-drag —
 * an HTML5 drag between the two panels cannot coexist with it.
 */
export async function startDrag(sender: WebContents, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  // Dragging a path that has since been deleted crashes the drag session on
  // some macOS versions; filter first.
  const existing: string[] = [];
  for (const p of paths) {
    try {
      await access(p);
      existing.push(p);
    } catch {
      /* gone between selection and drag */
    }
  }
  if (existing.length === 0) return;

  sender.startDrag({
    files: existing,
    // `file` is required by the type even when `files` is supplied.
    file: existing[0],
    icon: nativeImage.createFromBuffer(DRAG_ICON_PNG),
  });
}
