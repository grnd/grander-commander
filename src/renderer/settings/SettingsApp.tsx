/**
 * The settings window. One tab today, and the tab strip is here so the next one
 * costs a line rather than a layout.
 */
export function SettingsApp() {
  return (
    <div className="gc-settings">
      <nav className="gc-settings-tabs" aria-label="Settings sections">
        <button type="button" className="is-active">Shortcuts</button>
      </nav>
      <main className="gc-settings-body" />
    </div>
  );
}
