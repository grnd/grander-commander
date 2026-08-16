import type { FileEntry } from '@shared/types';

type Props = {
  entry: FileEntry;
  isCursor: boolean;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  /** Highlights this folder as the destination of the drag in flight. */
  isDropTarget?: boolean;
};

function formatSize(e: FileEntry): string {
  if (e.isDir) return '<DIR>';
  return e.size.toLocaleString('en-US');
}

function formatDate(mtime: number): string {
  if (!mtime) return '';
  const d = new Date(mtime);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${yy} ${hh}:${mi}`;
}

export function FileRow({
  entry, isCursor, isSelected, onMouseDown, onDoubleClick, onContextMenu, style,
  onDragStart, onDragOver, onDragLeave, onDrop, isDropTarget,
}: Props) {
  const cls = ['gc-file-row'];
  if (isCursor) cls.push('is-cursor');
  if (isSelected) cls.push('is-selected');
  if (entry.isDir) cls.push('is-dir');
  if (entry.isSymlink) cls.push('is-symlink');
  if (isDropTarget) cls.push('is-drop-target');

  return (
    <div
      className={cls.join(' ')}
      style={style}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      // ".." is not a thing to pick up; it is a place to drop into.
      draggable={Boolean(onDragStart) && entry.name !== '..'}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="gc-col gc-col-name">{entry.name}</div>
      <div className="gc-col gc-col-ext">{entry.ext}</div>
      <div className="gc-col gc-col-size">{formatSize(entry)}</div>
      <div className="gc-col gc-col-date">{formatDate(entry.mtime)}</div>
    </div>
  );
}
