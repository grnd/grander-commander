import { useEffect, useState } from 'react';
import type { UpdateStatus } from '@shared/types';

/**
 * Shows only when there is something to act on. A quiet "up to date" or a
 * background error must not occupy a row of a file manager's chrome, so those
 * states render nothing unless the check was user-initiated.
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    const api = window.gc;
    void api.update.status().then(setStatus).catch(() => {});
    return api.update.onStatus(setStatus);
  }, []);

  const version =
    status.kind === 'available' || status.kind === 'ready' ? status.version : null;
  if (version && dismissed === version) return null;

  switch (status.kind) {
    case 'available':
      return (
        <div className="gc-update-banner" role="status">
          <span>Version {status.version} is available.</span>
          <button onClick={() => void window.gc.update.download()}>Download</button>
          <button className="gc-update-dismiss" onClick={() => setDismissed(status.version)}>
            Later
          </button>
        </div>
      );
    case 'downloading':
      return (
        <div className="gc-update-banner" role="status">
          <span>Downloading update… {status.percent}%</span>
        </div>
      );
    case 'ready':
      return (
        <div className="gc-update-banner" role="status">
          <span>Version {status.version} is ready to install.</span>
          <button onClick={() => void window.gc.update.install()}>Restart &amp; Install</button>
          <button className="gc-update-dismiss" onClick={() => setDismissed(status.version)}>
            Later
          </button>
        </div>
      );
    default:
      return null;
  }
}
