import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve('src/renderer/index.html'), 'utf8');
// The policy itself contains single quotes ('self'), so only a double-quoted
// attribute delimiter can bound it.
const csp = /Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1] ?? '';

/**
 * The viewer renders images by wrapping the bytes it read over IPC in a Blob.
 * Under `default-src 'self'` with no img-src, Chromium blocks the blob: URL and
 * the image silently renders as a broken-image glyph — no console error loud
 * enough to notice, no failing unit test. This pins the rule.
 */
describe('renderer content security policy', () => {
  it('declares a policy at all', () => {
    expect(csp).not.toBe('');
    expect(csp).toContain("default-src 'self'");
  });

  it('allows the blob: images the internal viewer creates', () => {
    const imgSrc = /img-src ([^;]*)/.exec(csp)?.[1] ?? '';
    expect(imgSrc, 'img-src must be declared; default-src alone blocks blob:').not.toBe('');
    expect(imgSrc).toContain('blob:');
  });

  it('never opens the renderer up to the network', () => {
    expect(csp).not.toMatch(/https?:/);
    expect(csp).not.toContain('*');
  });

  it('does not allow inline or evaluated script', () => {
    const scriptSrc = /script-src ([^;]*)/.exec(csp)?.[1] ?? '';
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });
});
