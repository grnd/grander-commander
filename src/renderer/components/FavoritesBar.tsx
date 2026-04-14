type Props = {
  favorites: string[];
  onPick: (path: string) => void;
  onRemove: (path: string) => void;
};

function shortName(p: string): string {
  const i = p.lastIndexOf('/');
  const tail = i >= 0 ? p.slice(i + 1) : p;
  return tail || p;
}

export function FavoritesBar({ favorites, onPick, onRemove }: Props) {
  if (favorites.length === 0) return null;
  return (
    <div className="gc-favorites">
      <span className="gc-favorites-label">★</span>
      {favorites.map((p) => (
        <button
          key={p}
          className="gc-drive-btn gc-fav-btn"
          title={p}
          onClick={() => onPick(p)}
          onContextMenu={(e) => {
            e.preventDefault();
            if (confirm(`Remove "${p}" from favorites?`)) onRemove(p);
          }}
        >
          {shortName(p)}
        </button>
      ))}
    </div>
  );
}
