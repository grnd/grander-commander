import { useState } from 'react';

type Props = {
  cwd: string;
  onRun: (cmd: string) => void;
  onCursorUp?: () => void;
  onCursorDown?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
};

export function CommandLine({ cwd, onRun, onCursorUp, onCursorDown, inputRef }: Props) {
  const [value, setValue] = useState('');

  const commit = () => {
    const cmd = value.trim();
    if (!cmd) return;
    onRun(cmd);
    setValue('');
  };

  return (
    <div className="gc-cmdline">
      <span className="gc-cmdline-prompt">{cwd} ❯</span>
      <input
        ref={inputRef}
        className="gc-cmdline-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') {
            e.preventDefault();
            setValue('');
            (e.target as HTMLInputElement).blur();
          }
          else if (e.key === 'ArrowUp') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
            onCursorUp?.();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
            onCursorDown?.();
          }
        }}
      />
    </div>
  );
}
