// src/renderer/components/dialogs/BusyDialog.tsx
type Props = {
  detail: string;
  onCancel: () => void;
};

/**
 * For work that runs in one external process and reports no progress —
 * packing and unpacking. An honest indeterminate bar beats a fake percentage.
 */
export function BusyDialog({ detail, onCancel }: Props) {
  return (
    <div className="gc-busy">
      <p className="gc-busy-detail">{detail}</p>
      <div className="gc-busy-bar"><div className="gc-busy-fill" /></div>
      <div className="gc-modal-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
