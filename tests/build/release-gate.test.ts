import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const release = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

/**
 * v0.1.2 and v0.1.6 both shipped an app that opened to a blank window, because
 * one command built and published in a single breath — there was no point at
 * which the artifact existed and had not yet been uploaded.
 *
 * These assertions keep that point open: build, then prove the app starts,
 * then publish. Deleting or reordering the gate fails here.
 */
describe('release gate', () => {
  const smokeAt = release.indexOf('npm run smoke');
  const publishAt = release.indexOf('Publish the release');
  const buildAt = release.indexOf('npm run dist:universal');

  it('builds without publishing', () => {
    expect(release).toContain('--publish never');
    expect(release).not.toContain('--publish always');
  });

  it('smoke-tests the packaged app', () => {
    expect(smokeAt).toBeGreaterThan(-1);
    expect(pkg.scripts.smoke).toBe('node scripts/smoke-packaged.mjs');
  });

  it('runs the smoke test after the build and before the publish', () => {
    expect(buildAt).toBeGreaterThan(-1);
    expect(publishAt).toBeGreaterThan(-1);
    expect(smokeAt).toBeGreaterThan(buildAt);
    expect(publishAt).toBeGreaterThan(smokeAt);
  });

  it('publishes the manifest and the ZIP, not just the DMG', () => {
    // electron-updater reads latest-mac.yml and the ZIP; a DMG-only release
    // cannot be auto-updated from.
    expect(release).toContain('dist/latest-mac.yml');
    expect(release).toContain('dist/*.zip');
  });
});
