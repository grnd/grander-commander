type Props = {
  title: string;
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  bytesTotal: number;
  currentFile: string;
  onCancel: () => void;
};

export function ProgressDialog({ title, filesDone, filesTotal, bytesDone, bytesTotal, currentFile, onCancel }: Props) {
  const pct = bytesTotal > 0 ? Math.min(100, Math.floor((bytesDone / bytesTotal) * 100)) : 0;
  return (
    <div>
      <p><strong>{title}</strong></p>
      <p>{currentFile}</p>
      <div className="gc-progress-bar">
        <div className="gc-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p>{filesDone} / {filesTotal} files · {bytesDone.toLocaleString()} / {bytesTotal.toLocaleString()} bytes</p>
      <div className="gc-modal-actions">
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
