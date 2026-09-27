import { execFile } from 'node:child_process';
import { shell } from 'electron';

/**
 * Retarget the front Finder window instead of opening another one.
 *
 * `shell.openPath` opens a *new* window per folder, so the path bar chip grew
 * a pile of them. Finder's own scripting interface can point an existing
 * window somewhere else, which is what "show me this folder" should mean.
 *
 * The path arrives as `argv` rather than interpolated into the source: a
 * folder named `foo" of application "Terminal` would otherwise be a script
 * injection, and quotes are legal in HFS names.
 */
const SCRIPT = `on run argv
  set destination to POSIX file (item 1 of argv) as alias
  tell application "Finder"
    if (count of Finder windows) is 0 then
      set shown to make new Finder window to destination
    else
      set shown to front Finder window
      set target of shown to destination
    end if
    -- Activating raises every Finder window at once, so without this a stale
    -- one lands on top of the folder that was actually asked for.
    set index of shown to 1
    activate
  end tell
end run`;

/**
 * Show `dir` in Finder, reusing its front window when it has one.
 *
 * Driving Finder needs Automation consent, and the user is free to refuse it —
 * or to be running a Finder replacement that has no scripting interface at
 * all. Either way the chip still has to work, so any failure falls back to the
 * plain `openPath` this replaced. The fallback is also what runs the very
 * first time, while the consent prompt is still on screen.
 */
export async function openInFinder(dir: string): Promise<void> {
  await new Promise<void>((resolve) => {
    execFile('osascript', ['-e', SCRIPT, dir], (err) => {
      if (err) void shell.openPath(dir);
      resolve();
    });
  });
}
