import { useState } from 'react';
import type { Favorite } from '@shared/types';

type Props = {
  favorites: Favorite[];
  onPick: (path: string) => void;
  onEdit: (fav: Favorite) => void;
  onReorder: (from: number, to: number) => void;
};

function shortName(p: string): string {
  const i = p.lastIndexOf('/');
  const tail = i >= 0 ? p.slice(i + 1) : p;
  return tail || p;
}

export function FavoritesBar({ favorites, onPick, onEdit, onReorder }: Props) {
  const [dragOver, setDragOver] = useState<number | null>(null);

  if (favorites.length === 0) return null;

  return (
    <div className="gc-favorites">
      <span className="gc-favorites-label">★</span>
      {favorites.map((f, i) => {
        const display = f.label && f.label.length > 0 ? f.label : shortName(f.path);
        return (
          <button
            key={f.path}
            className={
              'gc-drive-btn gc-fav-btn' + (dragOver === i ? ' is-drop-target' : '')
            }
            title={f.label ? `${f.label} — ${f.path}` : f.path}
            onClick={() => onPick(f.path)}
            onContextMenu={(e) => { e.preventDefault(); onEdit(f); }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/gc-fav-index', String(i));
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOver(i);
            }}
            onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              const raw = e.dataTransfer.getData('text/gc-fav-index');
              const from = Number(raw);
              setDragOver(null);
              if (Number.isFinite(from) && from !== i) onReorder(from, i);
            }}
          >
            {display}
          </button>
        );
      })}
    </div>
  );
}
