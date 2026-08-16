import { describe, it, expect, vi } from 'vitest';
import {
  applyRenamePlan, buildRenamePlan, defaultRenameRule, splitName,
  type RenameRule,
} from '@renderer/commands/multirename';

const rule = (over: Partial<RenameRule> = {}): RenameRule => ({ ...defaultRenameRule(), ...over });
const namesOf = (plan: ReturnType<typeof buildRenamePlan>) => plan.rows.map((r) => r.newName);

describe('splitName', () => {
  it('splits on the last dot', () => {
    expect(splitName('a.b.txt')).toEqual({ base: 'a.b', ext: 'txt' });
  });

  it('treats a leading dot as part of the name', () => {
    expect(splitName('.gitignore')).toEqual({ base: '.gitignore', ext: '' });
  });

  it('handles a name with no dot', () => {
    expect(splitName('Makefile')).toEqual({ base: 'Makefile', ext: '' });
  });
});

describe('buildRenamePlan — find/replace', () => {
  it('leaves everything unchanged with the default rule', () => {
    const plan = buildRenamePlan(['a.txt', 'b.txt'], rule());
    expect(namesOf(plan)).toEqual(['a.txt', 'b.txt']);
    expect(plan.rows.every((r) => !r.changed)).toBe(true);
    expect(plan.applicable).toHaveLength(0);
  });

  it('applies a regex with backreferences to the name only', () => {
    const plan = buildRenamePlan(
      ['IMG_0421.jpg', 'IMG_0422.jpg'],
      rule({ find: '^IMG_(\\d+)$', replace: 'holiday-$1' }),
    );
    expect(namesOf(plan)).toEqual(['holiday-0421.jpg', 'holiday-0422.jpg']);
  });

  it('does not touch the extension when scoped to the name', () => {
    const plan = buildRenamePlan(['a.a'], rule({ find: 'a', replace: 'z', applyTo: 'name' }));
    expect(namesOf(plan)).toEqual(['z.a']);
  });

  it('can target the extension alone', () => {
    const plan = buildRenamePlan(['a.jpeg'], rule({ find: 'jpeg', replace: 'jpg', applyTo: 'ext' }));
    expect(namesOf(plan)).toEqual(['a.jpg']);
  });

  it('can rewrite across the dot in full mode', () => {
    const plan = buildRenamePlan(['a.txt'], rule({ find: 'a\\.txt', replace: 'b.md', applyTo: 'full' }));
    expect(namesOf(plan)).toEqual(['b.md']);
  });

  it('treats the pattern literally when regex is off', () => {
    const plan = buildRenamePlan(['a.b.txt'], rule({ find: 'a.b', replace: 'x', useRegex: false }));
    expect(namesOf(plan)).toEqual(['x.txt']);
  });

  it('treats $ in the replacement as data when regex is off', () => {
    const plan = buildRenamePlan(['cost.txt'], rule({ find: 'cost', replace: '$5', useRegex: false }));
    expect(namesOf(plan)).toEqual(['$5.txt']);
  });

  it('honours the case-sensitivity toggle', () => {
    const sensitive = buildRenamePlan(['ABC.txt'], rule({ find: 'abc', replace: 'x' }));
    expect(namesOf(sensitive)).toEqual(['ABC.txt']);
    const insensitive = buildRenamePlan(['ABC.txt'], rule({ find: 'abc', replace: 'x', caseSensitive: false }));
    expect(namesOf(insensitive)).toEqual(['x.txt']);
  });

  it('reports an invalid regex and leaves names alone', () => {
    const plan = buildRenamePlan(['a.txt'], rule({ find: '([', replace: 'x' }));
    expect(plan.regexError).toBeTruthy();
    expect(namesOf(plan)).toEqual(['a.txt']);
    expect(plan.blocked).toBe(true);
  });
});

describe('buildRenamePlan — templates and counter', () => {
  it('numbers files with {n}, padded to the requested width', () => {
    const plan = buildRenamePlan(
      ['x.jpg', 'y.jpg', 'z.jpg'],
      rule({ nameTemplate: 'photo_{n}', counterWidth: 3 }),
    );
    expect(namesOf(plan)).toEqual(['photo_001.jpg', 'photo_002.jpg', 'photo_003.jpg']);
  });

  it('respects the counter start and step', () => {
    const plan = buildRenamePlan(
      ['a', 'b'],
      rule({ nameTemplate: '{n}', counterStart: 10, counterStep: 5 }),
    );
    expect(namesOf(plan)).toEqual(['10', '15']);
  });

  it('can keep the old name alongside the counter', () => {
    const plan = buildRenamePlan(['a.txt'], rule({ nameTemplate: '{n}-{name}' }));
    expect(namesOf(plan)).toEqual(['1-a.txt']);
  });

  it('can rewrite the extension from a template', () => {
    const plan = buildRenamePlan(['a.txt'], rule({ extTemplate: 'bak' }));
    expect(namesOf(plan)).toEqual(['a.bak']);
  });

  it('drops the extension when its template is empty', () => {
    const plan = buildRenamePlan(['a.txt'], rule({ extTemplate: '' }));
    expect(namesOf(plan)).toEqual(['a']);
  });

  it('does not re-expand placeholders that came from the file name', () => {
    const plan = buildRenamePlan(['{n}.txt'], rule({ nameTemplate: '{name}-{n}' }));
    expect(namesOf(plan)).toEqual(['{n}-1.txt']);
  });
});

describe('buildRenamePlan — case transforms', () => {
  it('lowercases name and extension', () => {
    const plan = buildRenamePlan(['README.MD'], rule({ caseTransform: 'lower' }));
    expect(namesOf(plan)).toEqual(['readme.md']);
  });

  it('uppercases name and extension', () => {
    const plan = buildRenamePlan(['a.txt'], rule({ caseTransform: 'upper' }));
    expect(namesOf(plan)).toEqual(['A.TXT']);
  });

  it('title-cases the name but leaves the extension alone', () => {
    const plan = buildRenamePlan(['my holiday_photo.JPG'], rule({ caseTransform: 'title' }));
    expect(namesOf(plan)).toEqual(['My Holiday_Photo.JPG']);
  });

  it('sentence-cases only the first letter', () => {
    const plan = buildRenamePlan(['hELLO wORLD.txt'], rule({ caseTransform: 'sentence' }));
    expect(namesOf(plan)).toEqual(['Hello world.txt']);
  });
});

describe('buildRenamePlan — validation and collisions', () => {
  it('rejects an empty result name', () => {
    const plan = buildRenamePlan(['a.txt'], rule({ nameTemplate: '', extTemplate: '' }));
    expect(plan.rows[0].error).toBe('empty name');
    expect(plan.blocked).toBe(true);
  });

  it('rejects a slash in the new name', () => {
    const plan = buildRenamePlan(['a.txt'], rule({ nameTemplate: 'sub/a' }));
    expect(plan.rows[0].error).toBe('contains /');
  });

  it('rejects a name longer than 255 characters', () => {
    const plan = buildRenamePlan(['a.txt'], rule({ nameTemplate: 'x'.repeat(300) }));
    expect(plan.rows[0].error).toBe('too long');
  });

  it('flags both sides of a duplicate inside the batch', () => {
    const plan = buildRenamePlan(['a.txt', 'b.txt'], rule({ nameTemplate: 'same' }));
    expect(plan.rows.map((r) => r.error)).toEqual(['duplicate in batch', 'duplicate in batch']);
  });

  it('detects duplicates case-insensitively, as APFS does', () => {
    const plan = buildRenamePlan(['a.txt', 'b.txt'], rule({
      find: '^(a|b)$', replace: 'same', caseSensitive: true, nameTemplate: '{name}', extTemplate: 'TXT',
    }));
    // both become same.TXT
    expect(plan.rows.every((r) => r.error === 'duplicate in batch')).toBe(true);
  });

  it('flags a collision with an untouched neighbour', () => {
    const plan = buildRenamePlan(['a.txt'], rule({ nameTemplate: 'taken' }), ['a.txt', 'TAKEN.txt']);
    expect(plan.rows[0].error).toBe('name already taken');
  });

  it('does not treat a file being renamed away as a blocker', () => {
    // a -> b and b -> c: b is free by the time it is needed.
    const plan = buildRenamePlan(
      ['a.txt', 'b.txt'],
      rule({ find: 'a', replace: 'b', applyTo: 'name' }),
      ['a.txt', 'b.txt'],
    );
    expect(plan.rows[0].error).toBe('duplicate in batch');
  });

  it('allows a pure case change of a file against itself', () => {
    const plan = buildRenamePlan(['README.txt'], rule({ caseTransform: 'lower' }), ['README.txt']);
    expect(plan.rows[0].error).toBeNull();
    expect(plan.rows[0].newName).toBe('readme.txt');
  });
});

describe('applyRenamePlan', () => {
  const okApi = () => {
    const rename = vi.fn(async () => ({ ok: true as const, value: undefined }));
    return { api: { fs: { rename } }, rename };
  };

  it('does nothing when no row changes', async () => {
    const { api, rename } = okApi();
    const out = await applyRenamePlan(api, '/d', [
      { oldName: 'a', newName: 'a', changed: false, error: null },
    ]);
    expect(rename).not.toHaveBeenCalled();
    expect(out).toEqual({ renamed: 0, failures: [] });
  });

  it('renames directly when nothing collides', async () => {
    const { api, rename } = okApi();
    const out = await applyRenamePlan(api, '/d', [
      { oldName: 'a', newName: 'x', changed: true, error: null },
      { oldName: 'b', newName: 'y', changed: true, error: null },
    ]);
    expect(rename.mock.calls).toEqual([['/d/a', '/d/x'], ['/d/b', '/d/y']]);
    expect(out.renamed).toBe(2);
  });

  it('joins paths correctly at the filesystem root', async () => {
    const { api, rename } = okApi();
    await applyRenamePlan(api, '/', [{ oldName: 'a', newName: 'b', changed: true, error: null }]);
    expect(rename).toHaveBeenCalledWith('/a', '/b');
  });

  it('stages through temporaries when new names reuse old ones', async () => {
    const { api, rename } = okApi();
    await applyRenamePlan(api, '/d', [
      { oldName: 'a', newName: 'b', changed: true, error: null },
      { oldName: 'b', newName: 'a', changed: true, error: null },
    ]);
    // Two staging renames, then two finals — never a direct a->b that would
    // destroy b.
    expect(rename).toHaveBeenCalledTimes(4);
    const [first, second, third, fourth] = rename.mock.calls as unknown as [string, string][][];
    expect(first[1]).toMatch(/\/d\/\.gcmr-/);
    expect(second[1]).toMatch(/\/d\/\.gcmr-/);
    expect(third[1]).toBe('/d/b');
    expect(fourth[1]).toBe('/d/a');
  });

  it('skips rows the preview marked as errors', async () => {
    const { api, rename } = okApi();
    await applyRenamePlan(api, '/d', [
      { oldName: 'a', newName: '', changed: true, error: 'empty name' },
      { oldName: 'b', newName: 'y', changed: true, error: null },
    ]);
    expect(rename.mock.calls).toEqual([['/d/b', '/d/y']]);
  });

  it('reports per-file failures without aborting the batch', async () => {
    const rename = vi.fn(async (from: string) =>
      from.endsWith('/a')
        ? { ok: false as const, error: { kind: 'permission', path: from } }
        : { ok: true as const, value: undefined });
    const out = await applyRenamePlan({ fs: { rename } }, '/d', [
      { oldName: 'a', newName: 'x', changed: true, error: null },
      { oldName: 'b', newName: 'y', changed: true, error: null },
    ]);
    expect(out.renamed).toBe(1);
    expect(out.failures).toEqual([{ name: 'a', reason: 'permission' }]);
  });

  it('restores the original name when the second phase fails', async () => {
    const rename = vi.fn(async (_from: string, to: string) =>
      to === '/d/b'
        ? { ok: false as const, error: { kind: 'permission', path: to } }
        : { ok: true as const, value: undefined });
    const out = await applyRenamePlan({ fs: { rename } }, '/d', [
      { oldName: 'a', newName: 'b', changed: true, error: null },
      { oldName: 'b', newName: 'a', changed: true, error: null },
    ]);
    expect(out.failures.map((f) => f.name)).toEqual(['a']);
    // Last call puts the staged file back under its original name.
    expect(rename.mock.calls.at(-1)?.[1]).toBe('/d/a');
  });
});
