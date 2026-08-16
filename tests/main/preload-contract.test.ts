import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mainSrc = readFileSync(resolve('src/main/main.ts'), 'utf8');
const viteCfg = readFileSync(resolve('electron.vite.config.ts'), 'utf8');

/**
 * v0.1.6 shipped a blank window: PR #8 enabled the sandbox, but the preload was
 * still emitted as ESM (preload.mjs). Electron only supports ESM preload
 * scripts when sandbox is false — under a sandbox the preload silently never
 * runs, so window.gc is undefined and the renderer dies on first access.
 *
 * These assertions encode that rule so the combination cannot ship again.
 */
describe('preload / sandbox contract', () => {
  const sandboxEnabled = /sandbox:\s*true/.test(mainSrc);
  const preloadRef = /preload:\s*join\([^)]*['"]([^'"]+)['"]\)/.exec(mainSrc)?.[1] ?? '';

  it('references a preload file', () => {
    expect(preloadRef).not.toBe('');
  });

  it('does not combine a sandboxed renderer with an ESM preload', () => {
    if (!sandboxEnabled) return; // .mjs is fine when the sandbox is off
    expect(
      preloadRef.endsWith('.mjs'),
      `sandbox: true cannot load an ESM preload (${preloadRef}); emit CommonJS instead`,
    ).toBe(false);
  });

  it('builds the preload in a format matching the extension main loads', () => {
    if (!sandboxEnabled) return;
    // package.json is "type": "module", so a CJS preload needs the .cjs
    // extension for Node to parse it as CommonJS.
    expect(preloadRef.endsWith('.cjs')).toBe(true);
    expect(viteCfg).toMatch(/format:\s*['"]cjs['"]/);
    expect(viteCfg).toMatch(/entryFileNames:\s*['"]preload\.cjs['"]/);
  });
});
