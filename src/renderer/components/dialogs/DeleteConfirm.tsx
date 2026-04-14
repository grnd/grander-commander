type Props = {
  paths: string[];
  onConfirm: () => void;
  onCancel: () => void;
};

export function DeleteConfirm({ paths, onConfirm, onCancel }: Props) {
  return (
    <div>
      <p>Permanently delete {paths.length} item{paths.length === 1 ? '' : 's'}?</p>
      <p className="gc-modal-paths">{paths.slice(0, 5).join('\n')}{paths.length > 5 ? `\n…and ${paths.length - 5} more` : ''}</p>
      <p><strong>This cannot be undone.</strong></p>
      <div className="gc-modal-actions">
        <button onClick={onCancel} autoFocus>Cancel</button>
        <button onClick={onConfirm}>Delete</button>
      </div>
    </div>
  );
}
