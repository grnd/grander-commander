import { describe, it, expect } from 'vitest';
import { SURFACE_COMMAND_IDS } from '@shared/commands/ids';
import type { CommandId } from '@shared/commands/ids';
import type { CommandName } from '@renderer/commands';

describe('command ids', () => {
  // Types are erased at runtime, so the alias is proven by `npm run typecheck`;
  // this assignment is what tsc checks.
  it('keeps the renderer alias assignable both ways', () => {
    const a: CommandId = 'copy';
    const b: CommandName = a;
    const c: CommandId = b;
    expect(c).toBe('copy');
  });

  it('lists the commands a mounted surface owns', () => {
    expect([...SURFACE_COMMAND_IDS]).toEqual([
      'viewerScrollDown', 'viewerScrollUp', 'viewerScrollLeft', 'viewerScrollRight',
      'viewerPageDown', 'viewerPageUp', 'viewerDocStart', 'viewerDocEnd',
      'viewerFileStart', 'viewerFileEnd', 'viewerClose',
      'editorSave', 'editorClose',
    ]);
  });
});
