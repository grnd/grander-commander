import { useEffect, useState } from 'react';
import { keyIdFromEvent, type KeyId } from '@shared/keys/identity';
import { toAccelerator, toDisplay } from '@shared/keys/adapters';
import { reservedReason } from '@shared/keymap/reserved';

/**
 * Captures one combo.
 *
 * It consumes every key while it is open, so recording F8 cannot trash a file.
 * It also takes Enter and Escape as recordable keys, which is why Save and
 * Cancel are buttons rather than those two keys. Cmd+Return saves and
 * Cmd+period cancels, for a keyboard user.
 *
 * While it is open, main drops menu clicks as well. A click on Move to Trash
 * would otherwise act on the main window behind this one.
 */
export function KeyRecorder({ onRecord, onCancel }: {
  onRecord: (key: KeyId) => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState<KeyId | null>(null);

  useEffect(() => {
    void window.gc.keymap.setCapture({ capturing: true });
    return () => { void window.gc.keymap.setCapture({ capturing: false }); };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const id = keyIdFromEvent(e);
      if (!id) return;
      if (id === 'Cmd+Period') { onCancel(); return; }
      if (id === 'Cmd+Enter' && key && !reservedReason(key)) { onRecord(key); return; }
      setKey(id);
    };
    const onBlur = () => onCancel();
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [key, onRecord, onCancel]);

  const reserved = key ? reservedReason(key) : null;
  const inMenu = key ? toAccelerator(key) !== null : true;

  return (
    <div className="gc-recorder" role="group" aria-label="Record a shortcut">
      <span className="gc-recorder-key">{key ? toDisplay(key) : 'Press a key'}</span>
      {reserved && <span className="gc-recorder-note">{reserved} holds this key.</span>}
      {key && !reserved && !inMenu && (
        <span className="gc-recorder-note">
          The menu cannot show this key. It still works in the app.
        </span>
      )}
      <button
        type="button"
        disabled={!key || reserved !== null}
        onClick={() => key && onRecord(key)}
      >Save</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}
