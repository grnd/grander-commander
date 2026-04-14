import type { Volume } from '@shared/types';

type Props = {
  volumes: Volume[];
  currentPath: string;
  onPick: (path: string) => void;
};

function isPrefix(parent: string, child: string): boolean {
  if (parent === child) return true;
  const sep = parent.endsWith('/') ? '' : '/';
  return child.startsWith(parent + sep);
}

function pickActivePath(volumes: Volume[], currentPath: string): string | null {
  let best: string | null = null;
  for (const v of volumes) {
    if (isPrefix(v.path, currentPath) && (best === null || v.path.length > best.length)) {
      best = v.path;
    }
  }
  return best;
}

export function DriveBar({ volumes, currentPath, onPick }: Props) {
  const activePath = pickActivePath(volumes, currentPath);
  return (
    <div className="gc-drives">
      {volumes.map((v) => (
        <button
          key={v.path}
          className={`gc-drive-btn${v.path === activePath ? ' is-active' : ''}`}
          onClick={() => onPick(v.path)}
          title={v.path}
        >
          {v.name}
        </button>
      ))}
    </div>
  );
}
