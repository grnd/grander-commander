import type { CommandName } from '../commands';

type Props = {
  onInvoke: (cmd: CommandName) => void;
};

const BUTTONS: { key: string; label: string; cmd: CommandName }[] = [
  { key: 'F3', label: 'View', cmd: 'quickLook' },
  { key: 'F4', label: 'Edit', cmd: 'navigateInto' },    // open in default app (Enter-equivalent for files)
  { key: 'F5', label: 'Copy', cmd: 'copy' },
  { key: 'F6', label: 'Move', cmd: 'move' },
  { key: 'F7', label: 'MkDir', cmd: 'mkdir' },
  { key: 'F8', label: 'Delete', cmd: 'trash' },
  { key: 'F9', label: 'Term', cmd: 'openTerminal' },
  { key: 'F10', label: 'Quit', cmd: 'quitApp' },
];

export function FKeyBar({ onInvoke }: Props) {
  return (
    <div className="gc-fkeybar">
      {BUTTONS.map((b) => (
        <button key={b.key} className="gc-fkey-btn" onClick={() => onInvoke(b.cmd)}>
          <span className="gc-fkey-label">{b.key}</span> {b.label}
        </button>
      ))}
    </div>
  );
}
