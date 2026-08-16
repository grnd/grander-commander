// src/shared/text.ts
//
// Byte/text helpers needed on both sides of the bridge: the renderer's viewer
// formats them for display, and main uses the same rules when deciding whether
// two files can be compared line by line.

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

/**
 * Split on LF, tolerating CRLF, without leaving a phantom trailing line. Empty
 * input has *no* lines rather than one blank one — otherwise diffing an empty
 * file against a one-line file reports a changed line instead of an added one.
 */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
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
