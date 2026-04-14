import { useEffect, useRef, useState } from 'react';
import { FileList } from './FileList';
import { ColumnHeader } from './ColumnHeader';
import { PathBar } from './PathBar';
import { PanelStatusBar } from './PanelStatusBar';
import type { SortCol } from '@shared/types';
import type { PanelSide, PanelState } from '@renderer/state/panelSlice';

type Props = {
  side: PanelSide;
  panel: PanelState;
  isActive: boolean;
  onActivate: () => void;
  onRowClick: (index: number, e: React.MouseEvent) => void;
  onRowDouble: (index: number, e: React.MouseEvent) => void;
  onPathCommit: (p: string) => Promise<boolean>;
  onSort: (col: SortCol) => void;
  pathBarRef?: React.Ref<HTMLInputElement>;
};

export function Panel({ panel, isActive, onActivate, onRowClick, onRowDouble, onPathCommit, onSort, pathBarRef }: Props) {
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
      className={`gc-panel${isActive ? ' is-active' : ''}`}
      onMouseDown={onActivate}
    >
      <PathBar path={panel.path} onCommit={onPathCommit} active={isActive} inputRef={pathBarRef} />
      <ColumnHeader sort={panel.sort} onSort={onSort} />
      <div className="gc-panel-body" ref={bodyRef}>
        {size.h > 0 && (
          <FileList
            entries={panel.entries}
            cursor={panel.cursor}
            selection={panel.selection}
            width={size.w}
            height={size.h}
            onRowClick={onRowClick}
            onRowDouble={onRowDouble}
          />
        )}
      </div>
      <PanelStatusBar entries={panel.entries} selection={panel.selection} />
    </div>
  );
}
