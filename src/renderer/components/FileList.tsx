// src/renderer/components/FileList.tsx
import { useEffect, useRef } from 'react';
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
  onRowMouseDown: (index: number, e: React.MouseEvent) => void;
  onRowDouble: (index: number, e: React.MouseEvent) => void;
  onRowContextMenu?: (index: number, e: React.MouseEvent) => void;
  onRowDragStart?: (index: number, e: React.DragEvent) => void;
  onRowDragOver?: (index: number, e: React.DragEvent) => void;
  onRowDragLeave?: (index: number, e: React.DragEvent) => void;
  onRowDrop?: (index: number, e: React.DragEvent) => void;
  dropTargetIndex?: number | null;
};

export function FileList({
  entries, cursor, selection, width, height,
  onRowMouseDown, onRowDouble, onRowContextMenu,
  onRowDragStart, onRowDragOver, onRowDragLeave, onRowDrop, dropTargetIndex,
}: Props) {
  const listRef = useRef<List>(null);

  useEffect(() => {
    // Keep the cursor row within view; 'smart' only scrolls when cursor moves
    // out of the current viewport, matching TC's behavior.
    listRef.current?.scrollToItem(cursor, 'smart');
  }, [cursor]);

  return (
    <List
      ref={listRef}
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
            onMouseDown={(ev) => onRowMouseDown(index, ev)}
            onDoubleClick={(ev) => onRowDouble(index, ev)}
            onContextMenu={onRowContextMenu ? (ev) => onRowContextMenu(index, ev) : undefined}
            onDragStart={onRowDragStart ? (ev) => onRowDragStart(index, ev) : undefined}
            onDragOver={onRowDragOver ? (ev) => onRowDragOver(index, ev) : undefined}
            onDragLeave={onRowDragLeave ? (ev) => onRowDragLeave(index, ev) : undefined}
            onDrop={onRowDrop ? (ev) => onRowDrop(index, ev) : undefined}
            isDropTarget={dropTargetIndex === index}
          />
        );
      }}
    </List>
  );
}
