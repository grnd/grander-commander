import { shell } from 'electron';

/**
 * Deep link to System Settings -> Privacy & Security -> Full Disk Access.
 * The `x-apple.systempreferences:` scheme is what the pane has answered to
 * from Ventura through Tahoe; when it is not handled, openExternal rejects and
 * the caller falls back to the Privacy & Security root.
 */
const FULL_DISK_ACCESS = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFilesAccess';
const PRIVACY_ROOT = 'x-apple.systempreferences:com.apple.preference.security';

export async function openFullDiskAccessSettings(): Promise<void> {
  try {
    await shell.openExternal(FULL_DISK_ACCESS);
  } catch {
    await shell.openExternal(PRIVACY_ROOT).catch(() => {});
  }
}
