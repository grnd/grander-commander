import { describe, it, expect, afterEach, vi } from 'vitest';
import { mapFsError, permissionError } from '@main/fs/errors';

function onPlatform(p: NodeJS.Platform) {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(p);
}
afterEach(() => vi.restoreAllMocks());

describe('permissionError', () => {
  it('flags EPERM on macOS as a TCC block, since chmod cannot fix it', () => {
    onPlatform('darwin');
    expect(permissionError('/Users/u/Pictures/Photos Library.photoslibrary', 'EPERM'))
      .toEqual({ kind: 'permission', path: '/Users/u/Pictures/Photos Library.photoslibrary', tcc: true });
  });

  it('leaves EACCES unflagged — that one really is the file mode', () => {
    onPlatform('darwin');
    expect(permissionError('/tmp/secret', 'EACCES')).toEqual({ kind: 'permission', path: '/tmp/secret' });
  });

  it('does not claim TCC off macOS', () => {
    onPlatform('linux');
    expect(permissionError('/tmp/secret', 'EPERM')).toEqual({ kind: 'permission', path: '/tmp/secret' });
  });
});

describe('mapFsError', () => {
  it('carries the TCC flag through the shared errno mapping', () => {
    onPlatform('darwin');
    const err = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
    expect(mapFsError(err, '/tmp/x')).toEqual({ kind: 'permission', path: '/tmp/x', tcc: true });
  });
});
