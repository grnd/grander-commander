const SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Navigation',
    rows: [
      ['↑ ↓', 'Move cursor'],
      ['PgUp / PgDn', 'Jump 20 rows'],
      ['Home / End', 'First / last row'],
      ['Enter', 'Open folder / file'],
      ['Backspace', 'Parent folder'],
      ['Tab', 'Switch active panel'],
      ['Ctrl+U / Cmd+U', 'Swap panels'],
      ['Cmd+Left / Cmd+Right', 'Same dir to/from other panel'],
      ['Cmd+L', 'Focus path bar'],
      ['/', 'Path bar prefilled with /'],
      ['Ctrl+R / Cmd+R', 'Refresh panel'],
    ],
  },
  {
    title: 'Selection',
    rows: [
      ['Click', 'Move cursor + clear selection'],
      ['Cmd+Click', 'Toggle selection'],
      ['Shift+Click', 'Range select'],
      ['Space / Insert', 'Toggle mark on cursor'],
      ['Shift+↑ / Shift+↓', 'Mark and move'],
      ['Cmd+A', 'Select all (except ..)'],
      ['Escape', 'Clear selection'],
    ],
  },
  {
    title: 'Sorting & view',
    rows: [
      ['Click column header', 'Toggle sort direction'],
      ['Ctrl+F3 / F4 / F5 / F6', 'Sort by name / ext / size / date'],
      ['Ctrl+H', 'Toggle hidden files'],
    ],
  },
  {
    title: 'Mutations (M2)',
    rows: [
      ['F7 / Cmd+N', 'Create folder'],
      ['F2 / Cmd+Shift+R', 'Rename'],
      ['F5 / Cmd+C', 'Copy'],
      ['F6 / Cmd+X', 'Move'],
      ['F8 / Cmd+Delete', 'Move to Trash'],
      ['Shift+F8 / Cmd+Shift+Delete', 'Delete permanently'],
    ],
  },
  {
    title: 'Help',
    rows: [
      ['?', 'Show this cheatsheet (hold)'],
    ],
  },
];

export function Cheatsheet() {
  return (
    <div className="gc-cheatsheet-backdrop">
      <div className="gc-cheatsheet">
        <div className="gc-cheatsheet-title">Keyboard shortcuts</div>
        <div className="gc-cheatsheet-body">
          {SECTIONS.map((s) => (
            <div key={s.title} className="gc-cheatsheet-section">
              <h3>{s.title}</h3>
              <table>
                <tbody>
                  {s.rows.map(([combo, desc]) => (
                    <tr key={combo}>
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
