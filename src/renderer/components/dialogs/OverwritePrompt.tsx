import { useState } from 'react';
import type { ConflictAnswer } from '@shared/types';

function baseName(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

type Props = {
  srcPath: string;
  dstPath: string;
  onAnswer: (a: ConflictAnswer) => void;
};

export function OverwritePrompt({ srcPath, dstPath, onAnswer }: Props) {
  const [applyToAll, setApplyToAll] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(baseName(dstPath));

  if (renaming) {
    return (
      <div>
        <p>Rename the incoming file to:</p>
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newName && newName !== baseName(dstPath)) {
              onAnswer({ action: 'rename', newName, applyToAll: false });
            }
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
        <div className="gc-modal-actions">
          <button onClick={() => setRenaming(false)}>Back</button>
          <button
            disabled={!newName || newName === baseName(dstPath)}
            onClick={() => onAnswer({ action: 'rename', newName, applyToAll: false })}
          >Use this name</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p>File already exists at destination:</p>
      <p className="gc-modal-paths">{dstPath}</p>
      <p>Source: {srcPath}</p>
      <label>
        <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
        Apply to all conflicts
      </label>
      <div className="gc-modal-actions">
        <button onClick={() => onAnswer({ action: 'cancel' })}>Cancel</button>
        <button onClick={() => setRenaming(true)}>Rename…</button>
        <button onClick={() => onAnswer({ action: 'skip', applyToAll })}>Skip</button>
        <button autoFocus onClick={() => onAnswer({ action: 'overwrite', applyToAll })}>Overwrite</button>
      </div>
    </div>
  );
}
