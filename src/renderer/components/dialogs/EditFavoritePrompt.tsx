import { useEffect, useRef, useState } from 'react';

type Props = {
  path: string;
  initialLabel: string;
  onSave: (label: string) => void;
  onRemove: () => void;
  onCancel: () => void;
};

export function EditFavoritePrompt({ path, initialLabel, onSave, onRemove, onCancel }: Props) {
  const [value, setValue] = useState(initialLabel);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => onSave(value.trim());

  return (
    <div>
      <label>Label:</label>
      <input
        ref={inputRef}
        value={value}
        placeholder={path}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
      />
      <div className="gc-modal-paths" style={{ marginTop: 8 }}>{path}</div>
      <div className="gc-modal-actions">
        <button onClick={onRemove}>Remove</button>
        <button onClick={onCancel}>Cancel</button>
        <button onClick={commit}>Save</button>
      </div>
    </div>
  );
}
