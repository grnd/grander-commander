import type { FileEntry } from '@shared/types';
import { entryKey } from '@renderer/state/panelSlice';

type Props = { entries: FileEntry[]; selection: Set<string> };

export function PanelStatusBar({ entries, selection }: Props) {
  const files = entries.filter((e) => !e.isDir && e.name !== '..');
  if (selection.size > 0) {
    const chosen = files.filter((e) => selection.has(entryKey(e)));
    const bytes = chosen.reduce((s, e) => s + e.size, 0);
    return (
      <div className="gc-status">
        Selected {chosen.length} / {files.length} files · {bytes.toLocaleString()} bytes
      </div>
    );
  }
  const bytes = files.reduce((s, e) => s + e.size, 0);
  return <div className="gc-status">{files.length} files · {bytes.toLocaleString()} bytes</div>;
}
