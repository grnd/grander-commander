import { useState } from 'react';

type Props = {
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

export function MkDirPrompt({ onSubmit, onCancel }: Props) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const commit = () => { if (trimmed) onSubmit(trimmed); };

  return (
    <div>
      <label>New folder name:</label>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
      />
      <div className="gc-modal-actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={commit} disabled={!trimmed}>Create</button>
      </div>
    </div>
  );
}
