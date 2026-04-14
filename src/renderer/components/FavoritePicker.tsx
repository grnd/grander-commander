import { useEffect, useState } from 'react';

type Props = {
  favorites: string[];
  onPick: (path: string) => void;
  onCancel: () => void;
};

export function FavoritePicker({ favorites, onPick, onCancel }: Props) {
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(favorites.length - 1, c + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const p = favorites[cursor];
        if (p) onPick(p);
      }
      else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cursor, favorites, onPick, onCancel]);

  return (
    <div className="gc-modal-backdrop" onMouseDown={onCancel}>
      <div className="gc-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="gc-modal-title">Jump to favorite</div>
        <div className="gc-modal-body">
          {favorites.length === 0 ? (
            <p>No favorites yet. Press Ctrl+Shift+F in a folder to add it.</p>
          ) : (
            <ul className="gc-fav-picker">
              {favorites.map((p, i) => (
                <li
                  key={p}
                  className={i === cursor ? 'is-cursor' : ''}
                  onMouseDown={() => onPick(p)}
                  onMouseEnter={() => setCursor(i)}
                >{p}</li>
              ))}
            </ul>
          )}
          <div className="gc-modal-actions">
            <button onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
