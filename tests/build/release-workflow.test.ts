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
});
