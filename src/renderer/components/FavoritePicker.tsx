import { useEffect, useState } from 'react';
import type { Favorite } from '@shared/types';

type Props = {
  favorites: Favorite[];
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
        const f = favorites[cursor];
        if (f) onPick(f.path);
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
              {favorites.map((f, i) => (
                <li
                  key={f.path}
                  className={i === cursor ? 'is-cursor' : ''}
                  onMouseDown={() => onPick(f.path)}
                  onMouseEnter={() => setCursor(i)}
                >
                  {f.label ? (
                    <>
                      <span className="gc-fav-picker-label">{f.label}</span>
                      <span className="gc-fav-picker-path"> — {f.path}</span>
                    </>
                  ) : (
                    <span className="gc-fav-picker-path">{f.path}</span>
                  )}
                </li>
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
