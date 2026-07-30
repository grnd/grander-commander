import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listDir } from '@main/fs/listDir';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'gc-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('listDir', () => {
  it('returns ordinary files with name, ext, size, mtime', async () => {
    writeFileSync(join(tmp, 'readme.md'), 'hi');
    const r = await listDir(tmp, { showHidden: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const readme = r.value.find((e) => e.name === 'readme');
    expect(readme).toBeDefined();
    expect(readme!.ext).toBe('md');
    expect(readme!.isDir).toBe(false);
    expect(readme!.size).toBe(2);
  });

  it('marks directories with isDir=true and empty ext', async () => {
    mkdirSync(join(tmp, 'photos'));
    const r = await listDir(tmp, { showHidden: false });
    if (!r.ok) throw new Error('expected ok');
    const dir = r.value.find((e) => e.name === 'photos');
    expect(dir?.isDir).toBe(true);
    expect(dir?.ext).toBe('');
  });

  it('hides dotfiles when showHidden=false', async () => {
    writeFileSync(join(tmp, '.secret'), 'x');
    writeFileSync(join(tmp, 'visible.txt'), 'x');
    const r = await listDir(tmp, { showHidden: false });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.find((e) => e.name === '.secret')).toBeUndefined();
    expect(r.value.find((e) => e.name === 'visible')).toBeDefined();
  });

  it('shows dotfiles when showHidden=true', async () => {
    writeFileSync(join(tmp, '.secret'), 'x');
    const r = await listDir(tmp, { showHidden: true });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.find((e) => e.name === '.secret')).toBeDefined();
  });

  it('always hides .DS_Store and Icon\\r regardless of showHidden', async () => {
    writeFileSync(join(tmp, '.DS_Store'), 'x');
    writeFileSync(join(tmp, 'Icon\r'), 'x');
    writeFileSync(join(tmp, 'ok.txt'), 'x');
    const r = await listDir(tmp, { showHidden: true });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.find((e) => e.name === '.DS_Store')).toBeUndefined();
    expect(r.value.find((e) => e.name === 'Icon\r')).toBeUndefined();
    expect(r.value).toHaveLength(1);
  });

  it('detects symlinks with isSymlink=true', async () => {
    writeFileSync(join(tmp, 'target.txt'), 'hi');
    symlinkSync(join(tmp, 'target.txt'), join(tmp, 'link.txt'));
    const r = await listDir(tmp, { showHidden: false });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.find((e) => e.name === 'link')?.isSymlink).toBe(true);
  });

  it('detects .app bundles with isAppBundle=true and isDir=false (hybrid)', async () => {
    mkdirSync(join(tmp, 'Something.app'));
    const r = await listDir(tmp, { showHidden: false });
    if (!r.ok) throw new Error('expected ok');
    const app = r.value.find((e) => e.name === 'Something');
    expect(app?.isAppBundle).toBe(true);
    expect(app?.ext).toBe('app');
    expect(app?.isDir).toBe(false);
  });

  it('returns permission error for unreadable directory', async () => {
    const r = await listDir('/private/etc/cups/certs', { showHidden: false });
    // This should either succeed or fail with permission; never throw.
    expect(r.ok === true || (r.ok === false && r.error.kind === 'permission')).toBe(true);
  });

  it('returns not-found for missing path', async () => {
    const r = await listDir(join(tmp, 'nope'), { showHidden: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not-found');
  });

  it('treats a symlink to a directory as a directory so it can be entered', async () => {
    // ~/Google Drive is a symlink to ~/Library/CloudStorage/GoogleDrive-<account>.
    // Reporting it as a non-directory routes Enter to "open with default app"
    // instead of navigating, which is why the mount could not be entered.
    mkdirSync(join(tmp, 'target-dir'));
    symlinkSync(join(tmp, 'target-dir'), join(tmp, 'Google Drive'));
    const r = await listDir(tmp, { showHidden: false });
    if (!r.ok) throw new Error('expected ok');
    const link = r.value.find((e) => e.name === 'Google Drive');
    expect(link).toBeDefined();
    expect(link!.isDir).toBe(true);
    expect(link!.isSymlink).toBe(true);
  });

  it('does not treat a dangling symlink as a directory', async () => {
    symlinkSync(join(tmp, 'gone'), join(tmp, 'broken'));
    const r = await listDir(tmp, { showHidden: false });
    if (!r.ok) throw new Error('expected ok');
    const broken = r.value.find((e) => e.name === 'broken');
    expect(broken).toBeDefined();
    expect(broken!.isDir).toBe(false);
    expect(broken!.isSymlink).toBe(true);
  });

  it('lists a self-referential symlink instead of throwing ELOOP', async () => {
    // Following this link throws ELOOP; one cycle must not break the listing.
    symlinkSync(join(tmp, 'loop'), join(tmp, 'loop'));
    writeFileSync(join(tmp, 'sibling.txt'), 'x');
    const r = await listDir(tmp, { showHidden: false });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.find((e) => e.name === 'loop')?.isDir).toBe(false);
    expect(r.value.find((e) => e.name === 'sibling')).toBeDefined();
  });

  it('drops entries whose stat fails (race) and keeps rest', async () => {
    writeFileSync(join(tmp, 'a.txt'), 'x');
    writeFileSync(join(tmp, 'b.txt'), 'x');
    const r = await listDir(tmp, { showHidden: false });
    if (!r.ok) throw new Error('expected ok');
    // We can't easily simulate the race here, but the implementation
    // must tolerate missing-file stat errors per-entry.
    expect(r.value.length).toBe(2);
  });
});
