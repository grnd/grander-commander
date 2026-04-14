import { useEffect, useRef, useState } from 'react';

type Props = {
  oldName: string;
  onSubmit: (newName: string) => void;
  onCancel: () => void;
};

export function RenamePrompt({ oldName, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(oldName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const idx = oldName.lastIndexOf('.');
    const end = idx > 0 ? idx : oldName.length;
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(0, end);
  }, [oldName]);

  const commit = () => { if (value && value !== oldName) onSubmit(value); };

  return (
    <div>
      <label>Rename:</label>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
      />
      <div className="gc-modal-actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={commit} disabled={!value || value === oldName}>Rename</button>
      </div>
    </div>
  );
}
