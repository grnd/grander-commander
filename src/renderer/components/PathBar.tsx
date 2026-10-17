import { useEffect, useState } from 'react';

type Props = {
  path: string;
  onCommit: (newPath: string) => Promise<boolean>;
  active: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  /** A virtual listing shows a description here, not a folder to navigate to. */
  virtual?: boolean;
  /** Something dropped here is a place to go, never something to copy. */
  onLocationDrop?: (e: React.DragEvent) => void;
  /** Open this panel's folder in a Finder window. */
  onOpenInFinder?: () => void;
  /** Finder's own icon, when the system could supply one. */
  finderIcon?: string | null;
};

/**
 * The editable path, plus a chip that stands for the folder itself — Finder's
 * title-bar idiom. Clicking the chip opens that folder in Finder; the whole
 * bar is a drop target for a location, which is what separates "go here" from
 * the copy a drop on the listing means.
 */
export function PathBar({
  path, onCommit, active, inputRef, virtual = false,
  onLocationDrop, onOpenInFinder, finderIcon = null,
}: Props) {
  const [value, setValue] = useState(path);
  const [dropping, setDropping] = useState(false);
  useEffect(() => setValue(path), [path]);

  const accepts = Boolean(onLocationDrop);

  return (
    <div
      className={`gc-pathbar-row${dropping ? ' is-drop-target' : ''}`}
      onDragOver={accepts ? (e) => {
        e.preventDefault();
        // "link" is the OS cue for "this is a reference, nothing is copied".
        e.dataTransfer.dropEffect = 'link';
        setDropping(true);
      } : undefined}
      onDragLeave={accepts ? (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      } : undefined}
      onDrop={accepts ? (e) => {
        e.preventDefault();
        setDropping(false);
        onLocationDrop?.(e);
      } : undefined}
    >
      {onOpenInFinder && !virtual && (
        <button
          type="button"
          className="gc-path-proxy"
          title={`Open ${path} in Finder`}
          aria-label="Open this folder in Finder"
          // The path bar is the keyboard's business; a chip that took focus on
          // the way to the input would be in the way of typing a path.
          tabIndex={-1}
          onClick={onOpenInFinder}
        >
          {finderIcon
            ? <img className="gc-path-proxy-img" src={finderIcon} alt="" draggable={false} />
            : '🗂'}
        </button>
      )}
      <input
        ref={inputRef}
        className={`gc-pathbar${active ? ' is-active' : ''}${virtual ? ' is-virtual' : ''}`}
        title={path}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const input = e.currentTarget;
            const ok = await onCommit(value);
            if (ok) input.blur();
          }
          if (e.key === 'Escape') { setValue(path); (e.target as HTMLInputElement).blur(); }
        }}
      />
    </div>
  );
}
