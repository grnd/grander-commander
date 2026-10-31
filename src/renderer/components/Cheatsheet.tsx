import { CATALOG, type Category } from '@shared/commands/catalog';
import { bindingsFor, type Bindings } from '@shared/keymap/lookup';
import { toDisplay } from '@shared/keys/adapters';

/**
 * Gestures and explanations, which are not bindings and so cannot be generated.
 * Everything that *is* a binding comes from the catalog below, so this overlay
 * can never advertise a key that no longer does the job.
 */
const PROSE: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Mouse and drag',
    rows: [
      ['Click', 'Move cursor + clear selection'],
      ['Cmd+Click', 'Toggle selection'],
      ['Shift+Click', 'Range select'],
      ['Drag to other panel', 'Copy there'],
      ['Drag to Finder', 'Copy there'],
      ['Shift+drag', 'Move instead of copy'],
      ['Drop on a folder row', 'Into that folder'],
      ['Drop from Finder', 'Copy in (Shift to move)'],
      ['Right-click a row', 'File actions'],
      ['Right-click favorite', 'Edit label / remove'],
      ['Drag favorite', 'Reorder in the bar'],
      ['Right-click bookmark', 'Clear that slot'],
      ['Middle-click tab', 'Close it'],
      ['Drag the splitter', 'Resize the panes'],
    ],
  },
  {
    title: 'How things behave',
    rows: [
      ['Alt+letter', 'Quick search in the panel — keep typing (spaces too), arrows step match to match, Esc closes'],
      ['Typing', 'Goes to the shell command line'],
      ['Backspace', 'Erases the command line first; walks up when it is empty'],
      ['Enter on an archive', 'Browse inside without extracting'],
      ['Copy inside an archive', 'Extracts the selection to the other panel'],
      ['Enter on a file inside', 'Extracts to a temp copy and opens it'],
      ['Shell command', 'Runs in the active panel’s folder; output opens in a pane'],
    ],
  },
];

const ORDER: Category[] = [
  'Navigation', 'Selection', 'Files', 'Panels', 'View', 'Tabs', 'Bookmarks', 'Tools',
];

/**
 * Bookmark and tab slots are nine commands each; collapsed to one row they read
 * as the range they are, and still follow whatever they are bound to.
 */
function familyKey(id: string): string | null {
  return /[1-9]$/.test(id) ? id.slice(0, -1) : null;
}

function generated(bindings: Bindings): { title: string; rows: [string, string][] }[] {
  return ORDER.map((category) => {
    const rows: [string, string][] = [];
    const families = new Map<string, { keys: string[]; label: string }>();

    for (const c of CATALOG) {
      if (c.category !== category || c.system || c.requiresArgs) continue;
      const keys = [
        ...bindingsFor(bindings, c.context, c.id),
        ...Object.keys(c.alsoIn ?? {}).flatMap((ctx) =>
          bindingsFor(bindings, ctx as typeof c.context, c.id)),
      ];
      if (keys.length === 0) continue;

      const family = familyKey(c.id);
      if (family) {
        const seen = families.get(family);
        if (seen) seen.keys.push(keys[0]);
        else families.set(family, { keys: [keys[0]], label: c.label.replace(/ \d$/, '') });
        continue;
      }
      rows.push([keys.map(toDisplay).join(' / '), c.label]);
    }

    for (const { keys, label } of families.values()) {
      const shown = keys.length > 1
        ? `${toDisplay(keys[0])} … ${toDisplay(keys[keys.length - 1])}`
        : toDisplay(keys[0]);
      rows.push([shown, label]);
    }
    return { title: category, rows };
  }).filter((s) => s.rows.length > 0);
}

export function Cheatsheet({ bindings }: { bindings: Bindings }) {
  const sections = [...generated(bindings), ...PROSE];
  return (
    <div className="gc-cheatsheet-backdrop">
      <div className="gc-cheatsheet">
        <div className="gc-cheatsheet-title">Keyboard shortcuts</div>
        <div className="gc-cheatsheet-body">
          {sections.map((s) => (
            <div key={s.title} className="gc-cheatsheet-section">
              <h3>{s.title}</h3>
              <table>
                <tbody>
                  {s.rows.map(([combo, desc]) => (
                    <tr key={`${combo}-${desc}`}>
                      <td className="gc-cheatsheet-combo">{combo}</td>
                      <td>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="gc-cheatsheet-footer">Release ? to close</div>
      </div>
    </div>
  );
}
