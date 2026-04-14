import type { SortCol, SortDir } from '@shared/types';

type Props = {
  sort: { col: SortCol; dir: SortDir };
  onSort: (col: SortCol) => void;
};

function arrow(col: SortCol, active: { col: SortCol; dir: SortDir }) {
  if (active.col !== col) return '';
  return active.dir === 'asc' ? ' ▲' : ' ▼';
}

export function ColumnHeader({ sort, onSort }: Props) {
  return (
    <div className="gc-col-header">
      <div className="gc-col gc-col-name" onClick={() => onSort('name')}>Name{arrow('name', sort)}</div>
      <div className="gc-col gc-col-ext" onClick={() => onSort('ext')}>Ext{arrow('ext', sort)}</div>
      <div className="gc-col gc-col-size" onClick={() => onSort('size')}>Size{arrow('size', sort)}</div>
      <div className="gc-col gc-col-date" onClick={() => onSort('date')}>Date{arrow('date', sort)}</div>
    </div>
  );
}
