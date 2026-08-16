import { describe, it, expect } from 'vitest';
import {
  decodeText, extensionOf, formatBytes, hexDump, imageMimeFor,
  isProbablyBinary, sniffMode, splitLines,
} from '@renderer/viewer/format';

const bytes = (...v: number[]) => Uint8Array.from(v);
const ascii = (s: string) => new TextEncoder().encode(s);

describe('extensionOf', () => {
  it('lowercases and ignores leading dots', () => {
    expect(extensionOf('README.MD')).toBe('md');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('noext')).toBe('');
  });
});

describe('isProbablyBinary', () => {
  it('treats a NUL byte as conclusive', () => {
    expect(isProbablyBinary(bytes(0x41, 0x00, 0x42))).toBe(true);
  });

  it('accepts tabs and newlines as text', () => {
    expect(isProbablyBinary(ascii('a\tb\r\nc\n'))).toBe(false);
  });

  it('rejects a stream that is mostly control bytes', () => {
    expect(isProbablyBinary(bytes(1, 2, 3, 4, 5, 6, 7, 8, 65, 66))).toBe(true);
  });

  it('calls an empty head text', () => {
    expect(isProbablyBinary(bytes())).toBe(false);
  });
});

describe('sniffMode', () => {
  it('routes images by extension even when the bytes look binary', () => {
    expect(sniffMode('photo.PNG', bytes(0x89, 0x50, 0x4e, 0x47, 0))).toBe('image');
  });

  it('keeps a known text extension in text mode', () => {
    expect(sniffMode('notes.md', ascii('# hi'))).toBe('text');
  });

  it('falls back to hex for unknown binary content', () => {
    expect(sniffMode('blob.dat', bytes(0, 1, 2, 3))).toBe('hex');
  });

  it('shows unknown-extension ASCII as text', () => {
    expect(sniffMode('blob.dat', ascii('plain ascii content'))).toBe('text');
  });

  it('treats an empty file as text', () => {
    expect(sniffMode('empty.bin', bytes())).toBe('text');
  });
});

describe('splitLines', () => {
  it('strips CR and does not invent a trailing line', () => {
    expect(splitLines('a\r\nb\n')).toEqual(['a', 'b']);
  });

  it('keeps interior blank lines', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b']);
  });

  it('reports no lines for empty input', () => {
    expect(splitLines('')).toEqual([]);
  });
});

describe('hexDump', () => {
  it('formats a full row with offset, byte pairs and the ascii gutter', () => {
    const row = hexDump(ascii('ABCDEFGHIJKLMNOP'))[0];
    expect(row).toBe(
      '00000000  41 42 43 44 45 46 47 48  49 4a 4b 4c 4d 4e 4f 50  |ABCDEFGHIJKLMNOP|',
    );
  });

  it('pads a short final row so the gutter stays aligned', () => {
    const row = hexDump(ascii('hi'))[0];
    expect(row.startsWith('00000000  68 69 ')).toBe(true);
    expect(row.endsWith('|hi|')).toBe(true);
    expect(row.indexOf('|')).toBe(hexDump(ascii('ABCDEFGHIJKLMNOP'))[0].indexOf('|'));
  });

  it('renders unprintable bytes as dots', () => {
    expect(hexDump(bytes(0x00, 0x7f, 0x41))[0]).toContain('|..A|');
  });

  it('offsets addresses by the window base so paging stays truthful', () => {
    expect(hexDump(ascii('x'), 0x1000)[0].startsWith('00001000')).toBe(true);
  });

  it('returns one row per 16 bytes', () => {
    expect(hexDump(new Uint8Array(33))).toHaveLength(3);
  });
});

describe('decodeText', () => {
  it('decodes UTF-8 without throwing on invalid sequences', () => {
    expect(decodeText(ascii('héllo'))).toBe('héllo');
    expect(() => decodeText(bytes(0xff, 0xfe))).not.toThrow();
  });
});

describe('formatBytes', () => {
  it('uses plain bytes below 1 KB', () => {
    expect(formatBytes(999)).toBe('999 B');
  });

  it('scales up and keeps one decimal only while small', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(20 * 1024)).toBe('20 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('imageMimeFor', () => {
  it('maps known image extensions', () => {
    expect(imageMimeFor('a.jpg')).toBe('image/jpeg');
    expect(imageMimeFor('a.svg')).toBe('image/svg+xml');
  });

  it('falls back to octet-stream', () => {
    expect(imageMimeFor('a.zzz')).toBe('application/octet-stream');
  });
});
