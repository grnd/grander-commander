// src/renderer/components/dialogs/PackDialog.tsx
import { useState } from 'react';
import type { ArchiveFormat } from '@shared/types';

type Props = {
  sources: string[];
  destDir: string;
  defaultName: string;
  onSubmit: (name: string, format: ArchiveFormat) => void;
  onCancel: () => void;
};

const FORMATS: { value: ArchiveFormat; label: string; extension: string }[] = [
  { value: 'zip', label: 'ZIP', extension: '.zip' },
  { value: 'tar.gz', label: 'TAR + gzip', extension: '.tar.gz' },
  { value: 'tar.bz2', label: 'TAR + bzip2', extension: '.tar.bz2' },
  { value: 'tar.xz', label: 'TAR + xz', extension: '.tar.xz' },
  { value: 'tar', label: 'TAR (no compression)', extension: '.tar' },
  { value: '7z', label: '7-Zip (needs 7zz installed)', extension: '.7z' },
];

const EXTENSIONS = FORMATS.map((f) => f.extension);

/** Swap whichever archive extension is present for the chosen one. */
export function retarget(name: string, extension: string): string {
  const lower = name.toLowerCase();
  const current = EXTENSIONS.find((e) => lower.endsWith(e));
  const stem = current ? name.slice(0, name.length - current.length) : name;
  return `${stem}${extension}`;
}

export function PackDialog({ sources, destDir, defaultName, onSubmit, onCancel }: Props) {
  const [format, setFormat] = useState<ArchiveFormat>('zip');
  const [name, setName] = useState(`${defaultName}.zip`);

  const chooseFormat = (next: ArchiveFormat) => {
    const extension = FORMATS.find((f) => f.value === next)?.extension ?? '.zip';
    setFormat(next);
    setName((n) => retarget(n, extension));
  };

  const valid = name.trim().length > 0 && !name.includes('/');

  return (
    <form
      className="gc-pack"
      onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(name.trim(), format); }}
    >
      <p className="gc-pack-summary">
        Pack {sources.length} item{sources.length === 1 ? '' : 's'} into {destDir}
      </p>

      <label className="gc-pack-field">
        <span>Archive</span>
        <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>

      <label className="gc-pack-field">
        <span>Format</span>
        <select value={format} onChange={(e) => chooseFormat(e.target.value as ArchiveFormat)}>
          {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </label>

      {!valid && <p className="gc-pack-warning">Enter a file name without a slash.</p>}

      <div className="gc-modal-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={!valid}>Pack</button>
      </div>
    </form>
  );
}
