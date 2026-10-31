// src/renderer/components/BookmarkBar.tsx
import type { BookmarkSlot } from '@shared/commands/ids';
import { bindingsFor, type Bindings } from '@shared/keymap/lookup';
import { toDisplay } from '@shared/keys/adapters';

type Props = {
  bindings: Bindings;
  bookmarks: (string | null)[];
  onPick: (path: string) => void;
  onClear: (slot: number) => void;
};

function shortName(p: string): string {
  const i = p.lastIndexOf('/');
  const tail = i >= 0 ? p.slice(i + 1) : p;
  return tail || p;
}

/**
 * The nine Ctrl+1..9 slots. Hidden entirely until at least one is set, so an
 * empty strip does not eat a row of chrome — the cheatsheet carries discovery.
 */
export function BookmarkBar({ bindings, bookmarks, onPick, onClear }: Props) {
  if (!bookmarks.some(Boolean)) return null;

  /** The key a slot actually answers to, so the hint cannot go stale. */
  const slotKey = (slot: BookmarkSlot, kind: 'goto' | 'set') => {
    const id = kind === 'goto' ? `gotoBookmark${slot}` as const : `setBookmark${slot}` as const;
    const key = bindingsFor(bindings, 'global', id)[0];
    return key ? toDisplay(key) : 'unbound';
  };
  const jumpHint = `${slotKey(1, 'goto')}..${slotKey(9, 'goto')} jump · ${slotKey(1, 'set')}..${slotKey(9, 'set')} set`;

  return (
    <div className="gc-bookmarks">
      <span className="gc-bookmarks-label" title={jumpHint}>⌃</span>
      {bookmarks.map((path, i) => {
        const slot = i + 1;
        if (!path) return null;
        return (
          <button
            key={slot}
            className="gc-drive-btn gc-bookmark-btn"
            title={`${slotKey(slot as BookmarkSlot, 'goto')} — ${path} (right-click to clear)`}
            onClick={() => onPick(path)}
            onContextMenu={(e) => { e.preventDefault(); onClear(slot); }}
          >
            <span className="gc-bookmark-slot">{slot}</span>
            {shortName(path)}
          </button>
        );
      })}
    </div>
  );
}
