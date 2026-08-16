// src/renderer/viewer/format.ts
//
// Pure formatting helpers for the internal viewer (F3) and quick view (Ctrl+Q).
// Kept free of React so the byte-level rules are unit-testable.

export type ViewerMode = 'text' | 'hex' | 'image';

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif',
]);

/** Extensions whose bytes are text even though the content sniffs oddly. */
const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'log', 'csv', 'tsv', 'xml', 'html', 'htm', 'css', 'scss', 'less',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'h', 'cc', 'cpp', 'hpp', 'm', 'mm', 'sh', 'bash', 'zsh', 'fish', 'sql', 'plist',
  'gitignore', 'env', 'lock', 'diff', 'patch',
]);

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/**
 * Pick the mode a file should open in. Extension decides images; everything
 * else is judged on its first bytes, because a `.dat` full of ASCII is far more
 * useful as text than as hex, and a `.txt` full of NULs is not text at all.
 */
export function sniffMode(name: string, head: Uint8Array): ViewerMode {
  const ext = extensionOf(name);
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (head.length === 0) return 'text';
  if (TEXT_EXTS.has(ext)) return 'text';
  return isProbablyBinary(head) ? 'hex' : 'text';
}

/**
 * A NUL byte is the classic binary tell (it never appears in UTF-8 text), and a
 * high proportion of other control bytes catches the rest.
 */
export function isProbablyBinary(head: Uint8Array): boolean {
  const n = Math.min(head.length, 8000);
  if (n === 0) return false;
  let control = 0;
  for (let i = 0; i < n; i++) {
    const b = head[i];
    if (b === 0) return true;
    // Tab, LF, CR, FF and ESC are ordinary in text files.
    if (b < 0x20 && b !== 9 && b !== 10 && b !== 12 && b !== 13 && b !== 27) control++;
  }
  return control / n > 0.1;
}

export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/** Split on LF, tolerating CRLF, without leaving a phantom trailing line. */
export function splitLines(text: string): string[] {
  const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

const HEX = '0123456789abcdef';

function hex2(b: number): string {
  return HEX[(b >> 4) & 0xf] + HEX[b & 0xf];
}

function hex8(n: number): string {
  let s = '';
  for (let shift = 28; shift >= 0; shift -= 4) s += HEX[(n >>> shift) & 0xf];
  return s;
}

/**
 * `xxd`-style dump: offset, 16 space-separated byte pairs grouped in eights,
 * then the printable-ASCII gutter. `baseOffset` is the file offset of byte 0 so
 * paged windows keep true addresses.
 */
export function hexDump(bytes: Uint8Array, baseOffset = 0): string[] {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const row = bytes.subarray(i, i + 16);
    let left = '';
    let ascii = '';
    for (let j = 0; j < 16; j++) {
      if (j === 8) left += ' ';
      if (j < row.length) {
        left += hex2(row[j]) + ' ';
        ascii += row[j] >= 0x20 && row[j] < 0x7f ? String.fromCharCode(row[j]) : '.';
      } else {
        left += '   ';
      }
    }
    lines.push(`${hex8(baseOffset + i)}  ${left} |${ascii}|`);
  }
  return lines;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon',
  svg: 'image/svg+xml', avif: 'image/avif',
};

export function imageMimeFor(name: string): string {
  return MIME_BY_EXT[extensionOf(name)] ?? 'application/octet-stream';
}
