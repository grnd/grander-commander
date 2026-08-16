import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflow = readFileSync(resolve('.github/workflows/release.yml'), 'utf8');

describe('release workflow', () => {
  it('verifies the pushed tag matches package.json version before publishing', () => {
    expect(workflow).toContain('Verify tag matches package version');
    expect(workflow).toContain('process.env.GITHUB_REF_NAME');
    expect(workflow).toContain('require("./package.json")');
    expect(workflow).toContain("node -e '");
    expect(workflow).toContain('const expected = `v${pkg.version}`;');
  });

  // v0.2.0 published with an empty body. GitHub's generate-notes lists merged
  // pull requests, and that release was merged straight to master — so there
  // was nothing to list, and the step reported success anyway.
  describe('release notes', () => {
    it('falls back to the commit log when no pull requests are found', () => {
      expect(workflow).toContain('falling back to the commit log');
      expect(workflow).toContain("git log --no-merges --pretty='- %s'");
      expect(workflow).toContain('git describe --tags --abbrev=0');
    });

    // git describe and a tag-to-tag log both need real history.
    it('checks out enough history for the fallback to work', () => {
      expect(workflow).toContain('fetch-depth: 0');
    });

    it('fails the build rather than publishing an empty body', () => {
      expect(workflow).toContain('::error::release notes are empty');
      expect(workflow).toMatch(/release notes are empty[\s\S]*?exit 1/);
    });

    // `[ -n "$PREV" ] && RANGE=...` as the last command of an && list exits a
    // `set -e` script when the test is false — which is every first release.
    it('does not use a bare && test that set -e would trip over', () => {
      expect(workflow).not.toMatch(/\[ -n "\$PREV" \] &&/);
    });
  });

});
