// src/renderer/components/FileList.tsx
import { FixedSizeList as List } from 'react-window';
import { FileRow } from './FileRow';
import type { FileEntry } from '@shared/types';
import { entryKey } from '@renderer/state/panelSlice';

const ROW_HEIGHT = 18;

type Props = {
  entries: FileEntry[];
  cursor: number;
  selection: Set<string>;
  width: number;
  height: number;
  onRowClick: (index: number, e: React.MouseEvent) => void;
  onRowDouble: (index: number, e: React.MouseEvent) => void;
};

export function FileList({ entries, cursor, selection, width, height, onRowClick, onRowDouble }: Props) {
  return (
    <List
      height={height}
      width={width}
      itemCount={entries.length}
      itemSize={ROW_HEIGHT}
      overscanCount={10}
    >
      {({ index, style }) => {
        const e = entries[index];
        return (
          <FileRow
            entry={e}
            style={style}
            isCursor={index === cursor}
            isSelected={selection.has(entryKey(e))}
            onClick={(ev) => onRowClick(index, ev)}
            onDoubleClick={(ev) => onRowDouble(index, ev)}
          />
        );
      }}
    </List>
  );
}
