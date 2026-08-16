import { describe, it, expect } from 'vitest';
import { createTimedRegex } from '@main/fs/regexProbe';

describe('createTimedRegex', () => {
  it('answers an ordinary pattern', async () => {
    const re = createTimedRegex('needle', '');
    try {
      expect(await re.test('a needle here')).toBe(true);
      expect(await re.test('nothing')).toBe(false);
    } finally { re.dispose(); }
  });

  it('honours flags', async () => {
    const re = createTimedRegex('NEEDLE', 'i');
    try {
      expect(await re.test('a needle here')).toBe(true);
    } finally { re.dispose(); }
  });

  // The reason this module exists: RegExp.test is synchronous, so a
  // catastrophically backtracking pattern takes the whole process with it.
  // Here it must give up and let the search carry on.
  it('gives up on a catastrophically backtracking pattern instead of hanging', async () => {
    const re = createTimedRegex('^(a+)+$', '', 300);
    try {
      const started = Date.now();
      const verdict = await re.test(`${'a'.repeat(64)}!`);
      const elapsed = Date.now() - started;
      expect(verdict, 'a runaway pattern reports "do not know"').toBeNull();
      expect(elapsed, 'and it returns promptly').toBeLessThan(3000);
    } finally { re.dispose(); }
  });

  it('still works on the next file after killing a runaway', async () => {
    const re = createTimedRegex('^(a+)+$', '', 300);
    try {
      expect(await re.test(`${'a'.repeat(64)}!`)).toBeNull();
      // A string the same pattern matches quickly.
      expect(await re.test('aaaa')).toBe(true);
    } finally { re.dispose(); }
  });

  it('treats an invalid pattern as no match rather than throwing', async () => {
    const re = createTimedRegex('([', '');
    try {
      expect(await re.test('anything')).toBe(false);
    } finally { re.dispose(); }
  });

  it('answers null once disposed', async () => {
    const re = createTimedRegex('x', '');
    re.dispose();
    expect(await re.test('x')).toBeNull();
  });
});
