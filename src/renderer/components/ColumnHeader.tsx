import type { SortCol, SortDir } from '@shared/types';
import type { PanelSide } from '@renderer/state/panelSlice';
import { ColumnResizer } from './ColumnResizer';

type Props = {
  side: PanelSide;
  sort: { col: SortCol; dir: SortDir };
  onSort: (col: SortCol) => void;
};

function arrow(col: SortCol, active: { col: SortCol; dir: SortDir }) {
  if (active.col !== col) return '';
  return active.dir === 'asc' ? ' ▲' : ' ▼';
}

export function ColumnHeader({ side, sort, onSort }: Props) {
  return (
    <div className="gc-col-header">
      <div className="gc-col gc-col-name" onClick={() => onSort('name')}>
        Name{arrow('name', sort)}
        <ColumnResizer col="name" side={side} />
      </div>
      <div className="gc-col gc-col-ext" onClick={() => onSort('ext')}>
        Ext{arrow('ext', sort)}
        <ColumnResizer col="ext" side={side} />
      </div>
      <div className="gc-col gc-col-size" onClick={() => onSort('size')}>
        Size{arrow('size', sort)}
        <ColumnResizer col="size" side={side} />
      </div>
      <div className="gc-col gc-col-date" onClick={() => onSort('date')}>
        Date{arrow('date', sort)}
        <ColumnResizer col="date" side={side} />
      </div>
      <div className="gc-col-filler" />
    </div>
  );
}
