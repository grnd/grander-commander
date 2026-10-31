import { useEffect, useMemo, useState } from 'react';
import { commandById, type Category } from '@shared/commands/catalog';
import { bindingsFor } from '@shared/keymap/lookup';
import { keyIdFromEvent } from '@shared/keys/identity';
import { toAccelerator, toDisplay } from '@shared/keys/adapters';
import { lookupKey, buildKeyTable } from '@shared/keymap/lookup';
import type { Displaced } from '@shared/keymap/types';
import { rowName, shortcutRows, type Row } from './rows';
import { useKeymap } from './useKeymap';

const CATEGORIES: Category[] = [
  'Navigation', 'Selection', 'Files', 'Panels', 'View', 'Tabs', 'Bookmarks', 'Tools',
];

/** The commands a key answers to, so "find by key" can filter by one keystroke. */
function commandsForKey(bindings: Parameters<typeof buildKeyTable>[0], key: string): Set<string> {
  const table = buildKeyTable(bindings);
  const found = new Set<string>();
  for (const context of ['global', 'panel', 'viewer', 'editor', 'terminal', 'input', 'quickSearch'] as const) {
    const command = lookupKey(table, context, key);
    if (command) found.add(command);
  }
  return found;
}

export function ShortcutsTab() {
  const { snapshot, error, lastUndo, apply, undo, dismissUndo } = useKeymap();
  const [query, setQuery] = useState('');
  const [keyFilter, setKeyFilter] = useState<string | null>(null);
  const [findingByKey, setFindingByKey] = useState(false);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const rows = useMemo(() => shortcutRows(), []);

  // One keystroke, read by physical key, filters the list by what that key
  // does. It listens on the document, because the key can arrive with focus
  // anywhere in the window.
  useEffect(() => {
    if (!findingByKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const id = keyIdFromEvent(e);
      if (!id) return;
      setKeyFilter(id);
      setFindingByKey(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [findingByKey]);

  if (!snapshot) return <p className="gc-settings-loading">Reading the keymap…</p>;

  const readOnly = snapshot.readOnly;
  const matching = keyFilter ? commandsForKey(snapshot.bindings, keyFilter) : null;
  const visible = rows.filter((r) => {
    if (matching && !matching.has(r.command)) return false;
    if (!query) return true;
    return r.label.toLowerCase().includes(query.toLowerCase());
  });

  const describe = (displaced: Displaced[]): string => {
    const first = displaced[0];
    const from = commandById(first.command)?.label ?? first.command;
    return `Took ${toDisplay(first.key)} from ${from}.`;
  };

  return (
    <div className="gc-shortcuts">
      {snapshot.diagnostics.length > 0 && (
        <ul className="gc-shortcuts-diagnostics" aria-label="Keymap problems">
          {snapshot.diagnostics.map((d) => <li key={`${d.kind}-${d.message}`}>{d.message}</li>)}
        </ul>
      )}

      <div className="gc-shortcuts-search">
        <input
          type="search"
          placeholder="Search a command"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" onClick={() => setFindingByKey(true)} aria-pressed={findingByKey}>
          {findingByKey ? 'Press a key…' : 'Find by key'}
        </button>
        {keyFilter && (
          <button type="button" onClick={() => setKeyFilter(null)} aria-label="Clear the key filter">
            {toDisplay(keyFilter)} ✕
          </button>
        )}
      </div>

      {error && <p className="gc-shortcuts-error" role="alert">{error}</p>}

      {lastUndo && (
        <p className="gc-shortcuts-undo" role="status">
          {lastUndo.message}
          <button type="button" onClick={() => void undo(lastUndo.token)}>Undo</button>
          <button type="button" onClick={dismissUndo} aria-label="Dismiss">✕</button>
        </p>
      )}

      {CATEGORIES.map((category) => {
        const inCategory = visible.filter((r) => r.category === category);
        if (inCategory.length === 0) return null;
        return (
          <section key={category} className="gc-shortcuts-section">
            <h3>{category}</h3>
            <table>
              <tbody>
                {inCategory.map((r) => (
                  <ShortcutRow
                    key={`${r.command}|${r.context}`}
                    row={r}
                    keys={bindingsFor(snapshot.bindings, r.context, r.command)}
                    readOnly={readOnly}
                    onRemove={(key) => void apply({
                      kind: 'remove', context: r.context, command: r.command, key,
                    })}
                    onReset={() => void apply({
                      kind: 'resetCommand', context: r.context, command: r.command,
                    }, describe)}
                  />
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      <footer className="gc-shortcuts-footer">
        {confirmResetAll ? (
          <>
            <span>Every shortcut goes back to its default.</span>
            <button type="button" onClick={() => { setConfirmResetAll(false); void apply({ kind: 'resetAll' }); }}>
              Yes, reset all
            </button>
            <button type="button" onClick={() => setConfirmResetAll(false)}>Keep mine</button>
          </>
        ) : (
          <button type="button" disabled={readOnly} onClick={() => setConfirmResetAll(true)}>
            Reset all shortcuts
          </button>
        )}
      </footer>
    </div>
  );
}

function ShortcutRow({ row, keys, readOnly, onRemove, onReset }: {
  row: Row;
  keys: string[];
  readOnly: boolean;
  onRemove: (key: string) => void;
  onReset: () => void;
}) {
  return (
    <tr aria-label={rowName(row)}>
      <td className="gc-shortcuts-label">
        {row.label}
        {row.fixed && <span className="gc-shortcuts-fixed" title={row.fixed}>fixed in this version</span>}
        {row.note && <span className="gc-shortcuts-note" title={row.note}>note</span>}
      </td>
      <td className="gc-shortcuts-context">{row.contextLabel}</td>
      <td className="gc-shortcuts-keys">
        {keys.length === 0 && <span className="gc-shortcuts-none">none</span>}
        {keys.map((key) => (
          <span key={key} className="gc-shortcuts-chip">
            {toDisplay(key)}
            {toAccelerator(key) === null && (
              <span title="The menu cannot show this key. It still works in the app.">*</span>
            )}
            <button
              type="button"
              aria-label={`Remove ${toDisplay(key)}`}
              disabled={readOnly || row.fixed !== null}
              onClick={() => onRemove(key)}
            >✕</button>
          </span>
        ))}
      </td>
      <td className="gc-shortcuts-actions">
        <button type="button" disabled={readOnly || row.fixed !== null}>Record a key</button>
        <button type="button" disabled={readOnly || row.fixed !== null} onClick={onReset}>Reset</button>
      </td>
    </tr>
  );
}
