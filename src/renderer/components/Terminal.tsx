import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

type Props = {
  cwd: string;
  onClose: () => void;
};

export function Terminal({ cwd, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const xtermRef = useRef<XTerm | null>(null);

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
    xtermRef.current = xterm;

    let disposed = false;
    let unsubData: (() => void) | null = null;
    let unsubExit: (() => void) | null = null;

    (async () => {
      fit.fit();
      const { cols, rows } = xterm;
      const id = await api.terminal.spawn(cwd, cols, rows);
      if (disposed) { void api.terminal.kill(id); return; }
      idRef.current = id;

      unsubData = api.terminal.onData(id, (data) => xterm.write(data));
      unsubExit = api.terminal.onExit(id, () => onClose());
      xterm.onData((data) => { void api.terminal.write(id, data); });
    })();

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        const id = idRef.current;
        if (id) void api.terminal.resize(id, xterm.cols, xterm.rows);
      } catch { /* ignore */ }
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
      xtermRef.current = null;
      idRef.current = null;
    };
    // Intentionally recreate the pty when cwd changes.
  }, [cwd, onClose]);

  return (
    <div className="gc-terminal">
      <div className="gc-terminal-header">
        <span className="gc-terminal-title">bash — {cwd}</span>
        <button className="gc-terminal-close" onClick={onClose} title="Close terminal (Ctrl+`)">×</button>
      </div>
      <div ref={hostRef} className="gc-terminal-host" />
    </div>
  );
}
