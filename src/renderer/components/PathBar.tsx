import { useEffect, useState } from 'react';

type Props = {
  path: string;
  onCommit: (newPath: string) => Promise<boolean>;
  active: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  /** A virtual listing shows a description here, not a folder to navigate to. */
  virtual?: boolean;
};

export function PathBar({ path, onCommit, active, inputRef, virtual = false }: Props) {
  const [value, setValue] = useState(path);
  useEffect(() => setValue(path), [path]);

  return (
    <input
      ref={inputRef}
      className={`gc-pathbar${active ? ' is-active' : ''}${virtual ? ' is-virtual' : ''}`}
      title={path}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const input = e.currentTarget;
          const ok = await onCommit(value);
          if (ok) input.blur();
        }
        if (e.key === 'Escape') { setValue(path); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}
