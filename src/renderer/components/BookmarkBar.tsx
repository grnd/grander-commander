// src/renderer/components/BookmarkBar.tsx
type Props = {
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
export function BookmarkBar({ bookmarks, onPick, onClear }: Props) {
  if (!bookmarks.some(Boolean)) return null;

  return (
    <div className="gc-bookmarks">
      <span className="gc-bookmarks-label" title="Ctrl+1..9 jump · Ctrl+Shift+1..9 set">⌘</span>
      {bookmarks.map((path, i) => {
        const slot = i + 1;
        if (!path) return null;
        return (
          <button
            key={slot}
            className="gc-drive-btn gc-bookmark-btn"
            title={`Ctrl+${slot} — ${path} (right-click to clear)`}
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
