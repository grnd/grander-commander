import type { CommandId } from '@shared/commands/ids';
import { bindingsFor, type Bindings } from '@shared/keymap/lookup';
import { toDisplay } from '@shared/keys/adapters';

type Props = {
  bindings: Bindings;
  onInvoke: (cmd: CommandId) => void;
};

/**
 * A row of actions that shows the function key each one currently answers to.
 * It used to hardcode the pairs, so it advertised F9 and F10 with nothing
 * listening for either.
 */
const BUTTONS: { label: string; cmd: CommandId }[] = [
  { label: 'View', cmd: 'viewFile' },
  { label: 'Edit', cmd: 'editFile' },
  { label: 'Copy', cmd: 'copy' },
  { label: 'Move', cmd: 'move' },
  { label: 'MkDir', cmd: 'mkdir' },
  { label: 'Delete', cmd: 'trash' },
  { label: 'Term', cmd: 'openTerminal' },
  { label: 'Quit', cmd: 'quitApp' },
];

export function FKeyBar({ bindings, onInvoke }: Props) {
  return (
    <div className="gc-fkeybar">
      {BUTTONS.map((b) => {
        const fkey = bindingsFor(bindings, 'global', b.cmd).find((k) => /^F\d+$/.test(k));
        return (
          <button key={b.cmd} className="gc-fkey-btn" onClick={() => onInvoke(b.cmd)}>
            {fkey && <span className="gc-fkey-label">{toDisplay(fkey)}</span>}
            {fkey ? ` ${b.label}` : b.label}
          </button>
        );
      })}
    </div>
  );
}
