import { useEffect, useState } from 'react';

type Props = {
  path: string;
  onCommit: (newPath: string) => void;
  active: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
};

export function PathBar({ path, onCommit, active, inputRef }: Props) {
  const [value, setValue] = useState(path);
  useEffect(() => setValue(path), [path]);

  return (
    <input
      ref={inputRef}
      className={`gc-pathbar${active ? ' is-active' : ''}`}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(value); }
        if (e.key === 'Escape') { setValue(path); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}
