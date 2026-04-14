import { useState } from 'react';

type Props = {
  cwd: string;
  onRun: (cmd: string) => void;
  inputRef?: React.Ref<HTMLInputElement>;
};

export function CommandLine({ cwd, onRun, inputRef }: Props) {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const commit = () => {
    const cmd = value.trim();
    if (!cmd) return;
    onRun(cmd);
    setHistory((h) => [cmd, ...h].slice(0, 50));
    setHistoryIdx(-1);
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
            const next = Math.min(history.length - 1, historyIdx + 1);
            if (next >= 0 && history[next]) { setHistoryIdx(next); setValue(history[next]); }
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = historyIdx - 1;
            if (next < 0) { setHistoryIdx(-1); setValue(''); }
            else { setHistoryIdx(next); setValue(history[next]); }
          }
        }}
      />
    </div>
  );
}
