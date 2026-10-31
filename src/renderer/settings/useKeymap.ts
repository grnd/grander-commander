import { useCallback, useEffect, useState } from 'react';
import type { Op as KeymapOp } from '@shared/keymap/ops';
import type { Displaced, KeymapSnapshot } from '@shared/keymap/types';

export type UndoOffer = { token: string; message: string };

/**
 * The settings window's view of the keymap.
 *
 * Every edit carries the revision it was made against. A refusal comes back
 * with the snapshot to rebase on, so this window never gets stuck a revision
 * behind the file.
 */
export function useKeymap() {
  const [snapshot, setSnapshot] = useState<KeymapSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUndo, setLastUndo] = useState<UndoOffer | null>(null);

  // The first read and the first broadcast race. Keeping the newer revision
  // stops a late reply from putting this window back a revision.
  const adopt = useCallback((next: KeymapSnapshot) => {
    setSnapshot((held) => (held && held.revision > next.revision ? held : next));
  }, []);

  useEffect(() => {
    void window.gc.keymap.get().then(adopt);
    return window.gc.keymap.onChanged(adopt);
  }, [adopt]);

  const apply = useCallback(async (
    op: KeymapOp,
    describe?: (displaced: Displaced[]) => string,
  ): Promise<void> => {
    if (!snapshot) return;
    setError(null);
    const outcome = await window.gc.keymap.apply({ revision: snapshot.revision, op });
    setSnapshot(outcome.snapshot);
    if (!outcome.ok) {
      setError(outcome.message);
      setLastUndo(null);
      return;
    }
    const message = outcome.displaced.length > 0 ? describe?.(outcome.displaced) : undefined;
    setLastUndo(message && outcome.undoToken ? { token: outcome.undoToken, message } : null);
  }, [snapshot]);

  const undo = useCallback(async (token: string): Promise<void> => {
    if (!snapshot) return;
    const outcome = await window.gc.keymap.undo({ revision: snapshot.revision, token });
    setSnapshot(outcome.snapshot);
    setLastUndo(null);
    if (!outcome.ok) setError(outcome.message);
  }, [snapshot]);

  return { snapshot, error, lastUndo, apply, undo, dismissUndo: () => setLastUndo(null) };
}
