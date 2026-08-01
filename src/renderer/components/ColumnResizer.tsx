import { useCallback } from 'react';
import { useStore, type ColumnKey } from '@renderer/state/store';
import type { PanelSide } from '@renderer/state/panelSlice';

type Props = { col: ColumnKey; side: PanelSide };

export function ColumnResizer({ col, side }: Props) {
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = useStore.getState().columnWidths[side][col];
    const setColumnWidth = useStore.getState().setColumnWidth;
    const move = (ev: MouseEvent) => {
      setColumnWidth(side, col, startWidth + (ev.clientX - startX));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [col, side]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    useStore.getState().resetColumnWidth(side, col);
  }, [col, side]);

  return (
    <div
      className="gc-col-resizer"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
