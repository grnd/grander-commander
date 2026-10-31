import { describe, it, expect } from 'vitest';
import { canRun, type AvailabilitySnapshot } from '@shared/commands/availability';

const base: AvailabilitySnapshot = {
  dialogOpen: false, favoritePickerOpen: false, viewerOpen: false, editorOpen: false,
  commandOutputOpen: false, activeSource: 'fs', mountedSurfaces: [],
};

describe('canRun', () => {
  it('allows an ordinary command in an idle panel', () =>
    expect(canRun('copy', base)).toBe(true));

  // D1: these states only ever guarded the keyboard path.
  it('refuses a file command while a modal owns the screen', () => {
    expect(canRun('trash', { ...base, dialogOpen: true })).toBe(false);
    expect(canRun('copy', { ...base, favoritePickerOpen: true })).toBe(false);
    expect(canRun('mkdir', { ...base, commandOutputOpen: true })).toBe(false);
  });

  it('refuses a panel command while the viewer or editor is up', () => {
    expect(canRun('trash', { ...base, viewerOpen: true })).toBe(false);
    expect(canRun('trash', { ...base, editorOpen: true })).toBe(false);
  });

  it('still allows the surface’s own commands while it is mounted', () => {
    const s = { ...base, viewerOpen: true, mountedSurfaces: ['viewer'] as const };
    expect(canRun('viewerPageDown', s)).toBe(true);
    expect(canRun('viewerClose', s)).toBe(true);
  });

  it('refuses a surface command when that surface is not mounted', () =>
    expect(canRun('editorSave', base)).toBe(false));

  it('refuses argument-taking commands', () =>
    expect(canRun('runShellCommand', base)).toBe(false));

  // Copied from the sets that lived in App.tsx, so the rules do not drift:
  // copy inside an archive means extract, and mkdir needs one real folder.
  it('keeps the archive and virtual-panel rules', () => {
    expect(canRun('trash', { ...base, activeSource: 'archive' })).toBe(false);
    expect(canRun('viewFile', { ...base, activeSource: 'archive' })).toBe(false);
    expect(canRun('copy', { ...base, activeSource: 'archive' })).toBe(true);
    expect(canRun('mkdir', { ...base, activeSource: 'search' })).toBe(false);
    expect(canRun('copy', { ...base, activeSource: 'search' })).toBe(true);
  });
});
