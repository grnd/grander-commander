// src/main/fs/regexProbe.ts
import { Worker } from 'node:worker_threads';

/**
 * A user-supplied regex can backtrack catastrophically — `^(a+)+$` against a
 * few dozen characters already takes seconds, and against a megabyte of text it
 * effectively never returns. `RegExp.test` is synchronous, so neither the
 * search deadline nor the cancel token can interrupt it: the main process is
 * simply gone, taking the window with it.
 *
 * So content matching runs in a worker, which *can* be killed. The worker is
 * created from a source string rather than a separate file so the build needs
 * no extra entry point.
 */
const WORKER_SOURCE = `
const { parentPort } = require('node:worker_threads');
let re = null;
parentPort.on('message', (msg) => {
  if (msg.kind === 'pattern') {
    try { re = new RegExp(msg.source, msg.flags); } catch { re = null; }
    parentPort.postMessage({ kind: 'ready' });
    return;
  }
  let value = false;
  try { value = re ? re.test(msg.text) : false; } catch { value = false; }
  parentPort.postMessage({ kind: 'result', value });
});
`;

/** Long enough for a legitimate pattern over the 8 MB content cap. */
export const REGEX_TIMEOUT_MS = 2_000;

export type TimedRegex = {
  /** true / false, or null when the pattern ran too long on this input. */
  test(text: string): Promise<boolean | null>;
  dispose(): void;
};

export function createTimedRegex(
  source: string,
  flags: string,
  timeoutMs: number = REGEX_TIMEOUT_MS,
): TimedRegex {
  let worker: Worker | null = null;
  let disposed = false;

  const spawn = (): Worker => {
    const w = new Worker(WORKER_SOURCE, { eval: true });
    w.unref();
    w.on('error', () => { /* replaced on the next test */ });
    w.postMessage({ kind: 'pattern', source, flags });
    return w;
  };

  return {
    async test(text: string): Promise<boolean | null> {
      if (disposed) return null;
      if (!worker) worker = spawn();
      const active = worker;

      return new Promise<boolean | null>((resolve) => {
        let settled = false;
        const finish = (value: boolean | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          active.off('message', onMessage);
          active.off('error', onError);
          resolve(value);
        };
        const onMessage = (msg: { kind: string; value?: boolean }) => {
          if (msg.kind === 'result') finish(msg.value ?? false);
        };
        const onError = () => finish(null);
        const timer = setTimeout(() => {
          // Runaway. Kill it and start clean, so the next file is still tried.
          void active.terminate();
          if (worker === active) worker = null;
          finish(null);
        }, timeoutMs);

        active.on('message', onMessage);
        active.on('error', onError);
        active.postMessage({ kind: 'text', text });
      });
    },
    dispose() {
      disposed = true;
      if (worker) { void worker.terminate(); worker = null; }
    },
  };
}
