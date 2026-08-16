import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

/**
 * electron-vite's externalizeDepsPlugin leaves these as runtime imports in
 * out/main/main.js rather than bundling them, so they must exist in the
 * packaged app's node_modules. A `!node_modules/**` entry in build.files
 * silently strips them: the app then dies at launch with ERR_MODULE_NOT_FOUND
 * (electron-updater) or loses the embedded terminal (node-pty). Both shipped
 * that way in v0.1.2.
 */
const RUNTIME_MAIN_DEPS = ['electron-updater', 'node-pty'];

describe('electron-builder packaging config', () => {
  it('does not blanket-exclude node_modules from the package', () => {
    // Targeted exclusions are fine and sometimes necessary (node-pty's
    // prebuilds/ breaks the universal merge). What must never come back is a
    // wildcard that removes whole packages.
    const files: string[] = pkg.build.files;
    const blanket = files.filter((f) =>
      /^!node_modules\/(\*|\*\*)/.test(f),
    );
    expect(blanket).toEqual([]);
  });

  it('keeps each externalized dependency-s own files', () => {
    const files: string[] = pkg.build.files;
    for (const dep of RUNTIME_MAIN_DEPS) {
      const kills = files.filter(
        (f) => f.startsWith('!') && new RegExp(`^!node_modules/${dep}/(\\*|\\*\\*)`).test(f),
      );
      expect(kills, `${dep} must not be excluded wholesale`).toEqual([]);
    }
  });

  it('declares every externalized main-process import as a runtime dependency', () => {
    for (const dep of RUNTIME_MAIN_DEPS) {
      expect(pkg.dependencies, `${dep} must be a runtime dependency`).toHaveProperty(dep);
    }
  });

  it('unpacks node-pty from the asar so its native binary is loadable', () => {
    // .node binaries cannot be dlopen'd from inside an asar archive.
    expect(pkg.build.asarUnpack ?? []).toContainEqual(
      expect.stringContaining('node-pty'),
    );
  });
});
