import { useCallback, useEffect, useRef, useState } from 'react';
import type { Completion } from '@shared/types';
import {
  applyCompletion, commonPrefix, completionKindFor, tokenAt, unescapeToken,
} from '@renderer/commands/completion';

type Props = {
  /** Real directory the command runs in, and the base for path completion. */
  cwd: string;
  /** What the prompt shows — the same path with $HOME collapsed to `~`. */
  label: string;
  onRun: (cmd: string) => void;
  onCursorUp?: () => void;
  onCursorDown?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Injected so the component stays testable without the preload bridge. */
  complete?: (prefix: string, cwd: string, kind: 'command' | 'path') => Promise<Completion[]>;
};

type CycleState = {
  /** Offset where the token being completed starts; the span end is the caret. */
  start: number;
  items: Completion[];
  /** -1 = the common prefix is showing, no candidate chosen yet. */
  index: number;
};

export function CommandLine({ cwd, label, onRun, onCursorUp, onCursorDown, inputRef, complete }: Props) {
  const [value, setValue] = useState('');
  const [cycle, setCycle] = useState<CycleState | null>(null);
  const localRef = useRef<HTMLInputElement | null>(null);

  // The parent holds a ref for prefilling; this component needs one for caret
  // control, so both are fed from one callback ref.
  const attachRef = useCallback((el: HTMLInputElement | null) => {
    localRef.current = el;
    if (typeof inputRef === 'function') inputRef(el);
    else if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
  }, [inputRef]);

  // The DOM node still holds the old text when setValue returns, so the caret
  // has to be placed after React commits or it lands at the end of stale text.
  const pendingCaret = useRef<number | null>(null);
  useEffect(() => {
    if (pendingCaret.current === null) return;
    localRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  const setLine = (next: string, caret: number) => {
    pendingCaret.current = caret;
    setValue(next);
  };

  const commit = () => {
    const cmd = value.trim();
    setCycle(null);
    if (!cmd) return;
    onRun(cmd);
    setValue('');
  };

  const doComplete = async (backwards: boolean) => {
    const el = localRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;

    // Repeated Tab cycles the candidates found by the first Tab.
    if (cycle && cycle.items.length > 1 && cycle.start <= caret) {
      const n = cycle.items.length;
      // From "nothing chosen yet", forwards means the first candidate and
      // backwards means the last — not the second-to-last.
      const index = cycle.index < 0
        ? (backwards ? n - 1 : 0)
        : (((backwards ? cycle.index - 1 : cycle.index + 1) % n) + n) % n;
      const pick = cycle.items[index];
      const next = applyCompletion(value, { start: cycle.start, end: caret }, pick.value, {
        kind: pick.kind, terminate: false,
      });
      setCycle({ ...cycle, index });
      setLine(next.value, next.caret);
      return;
    }

    const token = tokenAt(value, caret);
    const kind = completionKindFor(token);
    const prefix = unescapeToken(value.slice(token.start, caret));
    const items = await (complete ?? window.gc.fs.complete)(prefix, cwd, kind);
    if (items.length === 0) { setCycle(null); return; }

    if (items.length === 1) {
      const only = items[0];
      const next = applyCompletion(value, { start: token.start, end: caret }, only.value, { kind: only.kind });
      setCycle(null);
      setLine(next.value, next.caret);
      return;
    }

    // Ambiguous: extend as far as every candidate agrees, then show the list.
    const shared = commonPrefix(items.map((i) => i.value));
    const next = applyCompletion(
      value,
      { start: token.start, end: caret },
      shared.length > prefix.length ? shared : prefix,
      { terminate: false },
    );
    setCycle({ start: token.start, items, index: -1 });
    setLine(next.value, next.caret);
  };

  return (
    <div className="gc-cmdline-wrap">
      {cycle && cycle.items.length > 1 && (
        <ul className="gc-cmdline-suggest" data-testid="gc-completions">
          {cycle.items.slice(0, 60).map((c, i) => (
            <li key={c.value} className={i === cycle.index ? 'is-cursor' : ''}>
              <span className={`gc-suggest-kind is-${c.kind}`}>
                {c.kind === 'dir' ? '/' : c.kind === 'exec' ? '*' : ' '}
              </span>
              {c.value}
            </li>
          ))}
          {cycle.items.length > 60 && <li className="gc-suggest-more">…{cycle.items.length - 60} more</li>}
        </ul>
      )}
      <div className="gc-cmdline">
        <span className="gc-cmdline-prompt">{label} ❯</span>
        <input
          ref={attachRef}
          className="gc-cmdline-input"
          value={value}
          onChange={(e) => { setValue(e.target.value); setCycle(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              void doComplete(e.shiftKey);
              return;
            }
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') {
              e.preventDefault();
              if (cycle) { setCycle(null); return; }
              setValue('');
              (e.target as HTMLInputElement).blur();
            }
            else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCycle(null);
              (e.target as HTMLInputElement).blur();
              onCursorUp?.();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCycle(null);
              (e.target as HTMLInputElement).blur();
              onCursorDown?.();
            }
          }}
        />
      </div>
    </div>
  );
}
