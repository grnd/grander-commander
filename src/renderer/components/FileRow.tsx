import type { FileEntry } from '@shared/types';

type Props = {
  entry: FileEntry;
  isCursor: boolean;
  isSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
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

export function FileRow({ entry, isCursor, isSelected, onClick, onDoubleClick, style }: Props) {
  const cls = ['gc-file-row'];
  if (isCursor) cls.push('is-cursor');
  if (isSelected) cls.push('is-selected');
  if (entry.isDir) cls.push('is-dir');
  if (entry.isSymlink) cls.push('is-symlink');

  return (
    <div className={cls.join(' ')} style={style} onClick={onClick} onDoubleClick={onDoubleClick}>
      <div className="gc-col gc-col-name">{entry.name}</div>
      <div className="gc-col gc-col-ext">{entry.ext}</div>
      <div className="gc-col gc-col-size">{formatSize(entry)}</div>
      <div className="gc-col gc-col-date">{formatDate(entry.mtime)}</div>
    </div>
  );
}
