const SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Navigation',
    rows: [
      ['↑ ↓', 'Move cursor'],
      ['PgUp / PgDn', 'Jump 20 rows'],
      ['Home / End', 'First / last row'],
      ['Cmd+↑ / Cmd+↓', 'First / last row'],
      ['Space', 'Quick Look preview (toggle)'],
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
      ['Shift+Space / Insert', 'Toggle mark on cursor'],
      ['Shift+↑ / Shift+↓', 'Mark and move'],
      ['Cmd+A', 'Select all (except ..)'],
      ['Escape', 'Clear selection'],
    ],
  },
  {
    title: 'Drag and drop',
    rows: [
      ['Drag to other panel', 'Copy there'],
      ['Shift+drag', 'Move instead of copy'],
      ['Drop on a folder row', 'Into that folder'],
      ['Alt+drag', 'Drag out to Finder'],
      ['Drop from Finder', 'Copy in'],
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
      ['Cmd+Backspace', 'Delete cursor item (confirm)'],
      ['Ctrl+M / Cmd+Shift+M', 'Multi-rename selected files'],
      ['Cmd+D', 'Compare two files by content'],
      ['Cmd+Y', 'Synchronize the two panel folders'],
      ['Cmd+F / Alt+F7', 'Find files (name, content, size, date)'],
      ['Cmd+Enter', 'Reveal cursor item in its folder'],
    ],
  },
  {
    title: 'Favorites',
    rows: [
      ['Cmd+Shift+F / Ctrl+Shift+F', 'Add current folder to favorites'],
      ['Cmd+G / Cmd+/', 'Go to favorite (picker)'],
      ['Right-click favorite', 'Edit label / remove'],
      ['Drag favorite', 'Reorder in the bar'],
      ['Right-click folder → Add to Favorites', 'Add that folder'],
    ],
  },
  {
    title: 'Archives',
    rows: [
      ['Enter on .zip / .tar.gz / .7z', 'Browse inside without extracting'],
      ['F5 inside an archive', 'Extract selection to the other panel'],
      ['Enter on a file inside', 'Extract to a temp copy and open'],
      ['Backspace at the top', 'Leave the archive'],
      ['Alt+F5 / Cmd+Shift+P', 'Pack selection into an archive'],
    ],
  },
  {
    title: 'Tabs',
    rows: [
      ['Cmd+T', 'New tab in the active panel'],
      ['Cmd+W', 'Close the current tab'],
      ['Cmd+1 … Cmd+9', 'Select tab by number'],
      ['Middle-click tab', 'Close it'],
    ],
  },
  {
    title: 'Bookmarks',
    rows: [
      ['Ctrl+1 … Ctrl+9', 'Jump to bookmarked folder'],
      ['Ctrl+Shift+1 … 9', 'Set bookmark to current folder'],
      ['Right-click bookmark', 'Clear that slot'],
    ],
  },
  {
    title: 'Viewer',
    rows: [
      ['F3', 'Internal viewer (text / hex / image)'],
      ['Ctrl+Q', 'Quick view in the other panel'],
      ['Escape / F3', 'Close the viewer'],
    ],
  },
  {
    title: 'Shell',
    rows: [
      ['Cmd+S', 'Open external terminal at current dir'],
      ['Ctrl+`', 'Toggle embedded bash terminal'],
      ['Tab (command line)', 'Complete path / executable'],
      ['Tab again / Shift+Tab', 'Cycle candidates'],
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
