import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

type Props = {
  /** Folder to spawn in. Read once, at spawn — see below. */
  cwd: string;
  onClose: () => void;
  /**
   * Hidden rather than unmounted, so toggling the terminal keeps the session.
   * Unmounting kills the pty and everything running in it.
   */
  hidden?: boolean;
};

export function Terminal({ cwd, onClose, hidden = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  // The shell owns its working directory from the moment it starts — the user
  // may have cd'd inside it. The panel's folder is only the starting point, so
  // it is captured here and never re-read.
  const spawnCwdRef = useRef(cwd);
  const [shellCwd, setShellCwd] = useState(cwd);
  // Held in a ref so the pty is not restarted when the parent re-renders with
  // a new closure.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const api = window.gc;
    const xterm = new XTerm({
      fontFamily: 'Menlo, monospace',
      fontSize: 12,
      cursorBlink: true,
      allowProposedApi: true,
      theme: { background: '#1e1e1e', foreground: '#e6e6e6' },
    });
    const fit = new FitAddon();
    xterm.loadAddon(fit);
    xterm.open(host);

    let disposed = false;
    let unsubData: (() => void) | null = null;
    let unsubExit: (() => void) | null = null;
    const startedIn = spawnCwdRef.current;
    setShellCwd(startedIn);

    (async () => {
      fit.fit();
      const { cols, rows } = xterm;
      const id = await api.terminal.spawn(startedIn, Math.max(1, cols), Math.max(1, rows));
      if (disposed) { void api.terminal.kill(id); return; }
      idRef.current = id;

      unsubData = api.terminal.onData(id, (data) => xterm.write(data));
      unsubExit = api.terminal.onExit(id, () => onCloseRef.current());
      xterm.onData((data) => { void api.terminal.write(id, data); });
    })();

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        const id = idRef.current;
        // While hidden the host measures 0x0, and a zero-sized resize is both
        // meaningless and rejected by the IPC guard.
        if (id && xterm.cols > 0 && xterm.rows > 0) {
          void api.terminal.resize(id, xterm.cols, xterm.rows);
        }
      } catch { /* a hidden or detached host has no usable geometry */ }
    });
    ro.observe(host);

    return () => {
      disposed = true;
      ro.disconnect();
      unsubData?.();
      unsubExit?.();
      const id = idRef.current;
      if (id) void api.terminal.kill(id);
      xterm.dispose();
      idRef.current = null;
    };
    // Deliberately empty: one pty per mounted Terminal, for its whole life.
    // Re-running this on a cwd change is what used to kill the session every
    // time the active panel changed.
  }, []);

  return (
    <div className="gc-terminal" hidden={hidden}>
      <div className="gc-terminal-header">
        <span className="gc-terminal-title">bash — {shellCwd}</span>
        <button className="gc-terminal-close" onClick={onClose} title="Hide terminal (Ctrl+`)">×</button>
      </div>
      <div ref={hostRef} className="gc-terminal-host" />
    </div>
  );
}
