type Props = {
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

export function EditorDirtyClose({ onSave, onDiscard, onCancel }: Props) {
  return (
    <div>
      <p>The file has unsaved changes.</p>
      <div className="gc-modal-actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={onDiscard}>Discard</button>
        <button autoFocus onClick={onSave}>Save</button>
      </div>
    </div>
  );
}
