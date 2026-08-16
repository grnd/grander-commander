import { useEffect, useRef, useState } from 'react';
import { FileList } from './FileList';
import { ColumnHeader } from './ColumnHeader';
import { PathBar } from './PathBar';
import { PanelStatusBar } from './PanelStatusBar';
import { TabBar } from './TabBar';
import type { SortCol } from '@shared/types';
import type { PanelSide, PanelState } from '@renderer/state/panelSlice';

type Props = {
  side: PanelSide;
  panel: PanelState;
  isActive: boolean;
  onActivate: () => void;
  onRowMouseDown: (index: number, e: React.MouseEvent) => void;
  onRowDouble: (index: number, e: React.MouseEvent) => void;
  onRowContextMenu?: (index: number, e: React.MouseEvent) => void;
  searchBuffer?: string | null;
  onPathCommit: (p: string) => Promise<boolean>;
  onSort: (col: SortCol) => void;
  pathBarRef?: React.Ref<HTMLInputElement>;
  tabs?: { id: string; path: string }[];
  activeTab?: number;
  onSelectTab?: (index: number) => void;
  onCloseTab?: (index: number) => void;
  onNewTab?: () => void;
  onRowDragStart?: (index: number, e: React.DragEvent) => void;
  /** `index` is null when the pointer is over the panel but not over a row. */
  onDragOverTarget?: (index: number | null, e: React.DragEvent) => void;
  onDropOnTarget?: (index: number | null, e: React.DragEvent) => void;
  onDragLeavePanel?: () => void;
  dropTargetIndex?: number | null;
  isDropActive?: boolean;
};

export function Panel({
  panel, isActive, onActivate, onRowMouseDown, onRowDouble, onRowContextMenu,
  onPathCommit, onSort, pathBarRef, searchBuffer,
  tabs, activeTab = 0, onSelectTab, onCloseTab, onNewTab,
  onRowDragStart, onDragOverTarget, onDropOnTarget, onDragLeavePanel,
  dropTargetIndex = null, isDropActive = false,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!bodyRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className={`gc-panel${isActive ? ' is-active' : ''}${isDropActive ? ' is-drop-active' : ''}`}
      onMouseDown={onActivate}
    >
      {tabs && (
        <TabBar
          tabs={tabs}
          activeIndex={activeTab}
          onSelect={(i) => onSelectTab?.(i)}
          onClose={(i) => onCloseTab?.(i)}
          onNew={() => onNewTab?.()}
        />
      )}
      <PathBar
        path={panel.path}
        onCommit={onPathCommit}
        active={isActive}
        inputRef={pathBarRef}
        virtual={panel.source.kind !== 'fs'}
      />
      <ColumnHeader sort={panel.sort} onSort={onSort} />
      {panel.error && <div className="gc-panel-error" role="alert">{panel.error}</div>}
      <div
        className="gc-panel-body"
        ref={bodyRef}
        // Empty space below the rows still drops into the panel's own folder.
        onDragOver={onDragOverTarget ? (e) => onDragOverTarget(null, e) : undefined}
        onDrop={onDropOnTarget ? (e) => onDropOnTarget(null, e) : undefined}
        onDragLeave={onDragLeavePanel ? (e) => {
          // Moving between rows fires dragleave on the body; only a pointer
          // that has actually left the panel should clear the highlight.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDragLeavePanel();
        } : undefined}
      >
        {size.h > 0 && (
          <FileList
            entries={panel.entries}
            cursor={panel.cursor}
            selection={panel.selection}
            width={size.w}
            height={size.h}
            onRowMouseDown={onRowMouseDown}
            onRowDouble={onRowDouble}
            onRowContextMenu={onRowContextMenu}
            onRowDragStart={onRowDragStart}
            onRowDragOver={onDragOverTarget}
            onRowDrop={onDropOnTarget}
            dropTargetIndex={dropTargetIndex}
          />
        )}
      </div>
      <PanelStatusBar entries={panel.entries} selection={panel.selection} searchBuffer={searchBuffer} />
    </div>
  );
}
