// src/renderer/components/dialogs/MultiRename.tsx
import { useMemo, useState } from 'react';
import {
  buildRenamePlan, defaultRenameRule,
  type CaseTransform, type RenamePreviewRow, type RenameRule, type RenameScope,
} from '@renderer/commands/multirename';

type Props = {
  names: string[];
  /** Every name in the directory, so collisions with untouched files are caught. */
  existingNames: string[];
  onApply: (rows: RenamePreviewRow[]) => void;
  onCancel: () => void;
};

const CASE_LABELS: Record<CaseTransform, string> = {
  none: 'unchanged',
  lower: 'lowercase',
  upper: 'UPPERCASE',
  title: 'Title Case',
  sentence: 'Sentence case',
};

const SCOPE_LABELS: Record<RenameScope, string> = {
  name: 'name only',
  ext: 'extension only',
  full: 'whole filename',
};

export function MultiRename({ names, existingNames, onApply, onCancel }: Props) {
  const [rule, setRule] = useState<RenameRule>(defaultRenameRule);
  const patch = (p: Partial<RenameRule>) => setRule((r) => ({ ...r, ...p }));

  const plan = useMemo(
    () => buildRenamePlan(names, rule, existingNames),
    [names, rule, existingNames],
  );

  const changedCount = plan.rows.filter((r) => r.changed && !r.error).length;
  const errorCount = plan.rows.filter((r) => r.error).length;

  return (
    <div className="gc-multirename">
      <div className="gc-mr-form">
        <label className="gc-mr-field">
          <span>Find</span>
          <input
            value={rule.find}
            placeholder={rule.useRegex ? 'regex, e.g. ^IMG_(\\d+)' : 'literal text'}
            onChange={(e) => patch({ find: e.target.value })}
            autoFocus
          />
        </label>
        <label className="gc-mr-field">
          <span>Replace</span>
          <input
            value={rule.replace}
            placeholder={rule.useRegex ? '$1 backreferences allowed' : ''}
            onChange={(e) => patch({ replace: e.target.value })}
          />
        </label>

        <div className="gc-mr-field gc-mr-toggles">
          <span />
          <div>
            <label>
              <input type="checkbox" checked={rule.useRegex}
                onChange={(e) => patch({ useRegex: e.target.checked })} /> regex
            </label>
            <label>
              <input type="checkbox" checked={rule.caseSensitive}
                onChange={(e) => patch({ caseSensitive: e.target.checked })} /> match case
            </label>
            <label>
              search in{' '}
              <select value={rule.applyTo}
                onChange={(e) => patch({ applyTo: e.target.value as RenameScope })}>
                {(Object.keys(SCOPE_LABELS) as RenameScope[]).map((s) => (
                  <option key={s} value={s}>{SCOPE_LABELS[s]}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <label className="gc-mr-field">
          <span>Name</span>
          <input value={rule.nameTemplate}
            onChange={(e) => patch({ nameTemplate: e.target.value })} />
        </label>
        <label className="gc-mr-field">
          <span>Extension</span>
          <input value={rule.extTemplate}
            onChange={(e) => patch({ extTemplate: e.target.value })} />
        </label>

        <div className="gc-mr-field gc-mr-toggles">
          <span />
          <div>
            <label>
              case{' '}
              <select value={rule.caseTransform}
                onChange={(e) => patch({ caseTransform: e.target.value as CaseTransform })}>
                {(Object.keys(CASE_LABELS) as CaseTransform[]).map((c) => (
                  <option key={c} value={c}>{CASE_LABELS[c]}</option>
                ))}
              </select>
            </label>
            <label>
              counter start{' '}
              <input type="number" aria-label="counter start" value={rule.counterStart}
                onChange={(e) => patch({ counterStart: Number(e.target.value) || 0 })} />
            </label>
            <label>
              step{' '}
              <input type="number" aria-label="counter step" value={rule.counterStep}
                onChange={(e) => patch({ counterStep: Number(e.target.value) || 0 })} />
            </label>
            <label>
              digits{' '}
              <input type="number" aria-label="counter digits" min={1} max={12} value={rule.counterWidth}
                onChange={(e) => patch({ counterWidth: Number(e.target.value) || 1 })} />
            </label>
          </div>
        </div>

        <p className="gc-mr-hint">
          Placeholders: <code>{'{name}'}</code> <code>{'{ext}'}</code> <code>{'{n}'}</code>
        </p>
      </div>

      {plan.regexError && (
        <div className="gc-mr-regex-error" role="alert">Invalid pattern: {plan.regexError}</div>
      )}

      <table className="gc-mr-preview">
        <thead>
          <tr><th>#</th><th>Current name</th><th>New name</th></tr>
        </thead>
        <tbody>
          {plan.rows.map((row, i) => (
            <tr
              key={row.oldName}
              className={row.error ? 'is-error' : row.changed ? 'is-changed' : ''}
            >
              <td className="gc-mr-num">{i + 1}</td>
              <td className="gc-mr-old">{row.oldName}</td>
              <td className="gc-mr-new">
                {row.newName}
                {row.error && <span className="gc-mr-badge">{row.error}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="gc-mr-summary">
        {changedCount} of {plan.rows.length} will be renamed
        {errorCount > 0 && <span className="gc-mr-blocked"> · {errorCount} blocking problem(s)</span>}
      </div>

      <div className="gc-modal-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          disabled={plan.blocked || changedCount === 0}
          onClick={() => onApply(plan.rows)}
        >
          Rename {changedCount || ''}
        </button>
      </div>
    </div>
  );
}
