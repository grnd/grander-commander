import type { Volume } from '@shared/types';

type Props = {
  volumes: Volume[];
  currentPath: string;
  onPick: (path: string) => void;
};

export function DriveBar({ volumes, currentPath, onPick }: Props) {
  return (
    <div className="gc-drives">
      {volumes.map((v) => (
        <button
          key={v.path}
          className={`gc-drive-btn${currentPath.startsWith(v.path) ? ' is-active' : ''}`}
          onClick={() => onPick(v.path)}
          title={v.path}
        >
          {v.name}
        </button>
      ))}
    </div>
  );
}
