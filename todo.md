# GranderCommander — TODO

Rolling list of what's next. Grouped by milestone. Check off as we ship.

## M3 — Power user

- [x] **Archives**: open `.zip` / `.tar.gz` / `.7z` as a virtual panel (enter, extract selection, create). Driven by the tools macOS ships (`unzip`/`zip`, `tar`); 7-Zip is looked up at runtime and reports `brew install sevenzip` when missing.
- [x] **Multi-rename tool**: regex find/replace, counter `{n}`, case transforms, preview table, dry-run diff. `Ctrl+M`.
- [x] **File compare**: diff two marked files side-by-side. `Cmd+D`. Uses an in-tree Myers diff rather than shelling out — the output has to be *aligned rows*, which unified-diff text cannot give back losslessly.
- [x] **Folder sync**: dual-panel diff — left-only / right-only / differ / same, with Copy-missing and Mirror actions. `Cmd+Y`.
- [x] **Search panel**: `Cmd+F` opens a global search (name glob/regex + content regex, size/date filters), results materialise as a virtual panel.
- [x] **Tabbed panels**: per-panel tabs with `Cmd+T` / `Cmd+W` / `Cmd+{1..9}`.
- [x] **Bookmarks with hotkeys**: `Ctrl+1..9` to jump, `Ctrl+Shift+1..9` to set.
- [x] **Internal viewer**: `F3` opens a read-only viewer with text / hex / image modes.
- [x] **Drag and drop** between panels and to/from Finder (`Alt`+drag for the Finder direction — Electron's native drag cannot share a gesture with an in-app HTML5 drag).
- [x] **Command-line completion**: path + executable completion for the bottom cmdline. `Tab`, then `Tab` / `Shift+Tab` to cycle.
- [x] Ctrl+q - quick preview (turns the other pane to an internal viewer, just like Total Commander)

Follow-ups this milestone left behind:

- [ ] **Archive write-through**: rename/delete *inside* an archive, and drag-drop into one. Today an archive panel is read-only apart from extraction.
- [ ] **Search progress**: results arrive in one capped batch (5000 hits / 30s). Streaming them would need an ops-style event bridge.
- [ ] **Pack/extract progress**: the busy dialog is indeterminate because the tools report nothing parseable on stdout.
- [ ] **Tabs do not persist** across restarts.

## Open decisions — raised by M3 hands-on testing

Both are "we have two things that overlap"; neither is urgent, both delete or
avoid code once decided.

- [ ] **Terminal: one per folder, addressable?** The reload bug is fixed (the
  pty now survives pane switches and `Ctrl+\``), which was most of the pain.
  The remaining ask is several shells, reachable by number.
  - *Rejected approach*: making the terminal a **panel** tab. A panel tab is a
    snapshot — only the active one renders, state is swapped in and out — and
    that only works because a folder listing is data. A terminal cannot be a
    snapshot: xterm and the pty must stay mounted or it reloads again. So it
    would mean `PanelState` becoming a folder|terminal union, and every
    consumer of `panels[side]` (command line, F-keys, mutations, drag/drop,
    sync, compare, path bar) learning to handle "the active tab is not a
    folder" — the same surface already patched three times for virtual panels.
    The tab machinery would buy the *strip*, not the lifecycle.
  - *Preferred if we do it*: the terminal pane gets **its own** tab strip.
    `Cmd+T` while it has focus adds a shell at the active panel's folder;
    `Cmd+1..9` addresses terminal tabs when the terminal is focused and panel
    tabs otherwise. Context-sensitive shortcuts already exist here (`Cmd+C` is
    copy-files in a panel, copy-text in a field).

- [ ] **Favorites and bookmarks are the same feature.** Recommendation: keep
  favorites, drop the bookmarks slice, and give the **first nine favorites**
  automatic `Ctrl+1..9` with a small number badge on the chip.
  - Favorites are the richer half: unbounded, labelled, drag-reorderable, with
    a `Cmd+G` picker. Bookmarks contribute exactly one column — the hotkeys.
    Folding them in keeps everything, removes a bar's worth of chrome, and
    makes drag-to-reorder mean drag-to-reassign-hotkey. It is also the browser
    bookmarks-bar model, so it needs no explaining. Net deletion: the
    bookmarks slice, bar, persistence and tests.
  - *Cost, honestly*: sparse stable slots go away. Today slot 3 can be set with
    2 empty, and adding a bookmark renumbers nothing; merged, inserting a
    favorite at the front shifts every hotkey below it.

## M4 — Release

- [x] **Proper update mechanism**, like orca: electron-updater with a generic feed pointed at GitHub Releases, re-pinned per check to a concrete tag URL to avoid redirect drift. Supersedes the S3 idea. Exercised end to end since v0.1.4.
- [x] **Code signing + notarization** for `.dmg` (Developer ID) — hardened runtime, entitlements, notarize. All five repo secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) are set, and every release from v0.1.4 onward has been signed and notarized by CI.
- [ ] **Crash reporting** (Sentry or Crashpad).
- [ ] **CI**: GitHub Actions — typecheck + lint + test on PRs; release job on tags.
- [x] **Icon + DMG background polish**: current icon is a dog-with-shield placeholder.
- [ ] **App Store-ready build**? (Evaluate sandbox restrictions on fs access.)
- [ ] **Keyboard-configurable shortcuts** (`settings.json`).
- [ ] Add a settings screen. among other things, should have a keyboard shortcuts configuration tab

## Polish / UX

- [ ] **Theme system**: light / dark / classic TC blue, user-overridable via `theme.json`.
- [ ] **Density toggle**: compact / comfortable row heights.
- [ ] **Column chooser**: show/hide/reorder columns per panel.
- [ ] **Per-panel sort persistence** across restarts.
- [ ] **Remember window size + splitter ratio** across launches.
- [ ] **Breadcrumb path bar** in addition to the editable one.
- [ ] **Inline rename** (press `F2` rename should also work as click-click-slow on selected row? TBD).
- [ ] **Localization scaffolding** (English only for now).

## Correctness / perf

- [ ] **Watch active directories** with `fs.watch` + debounce; refresh on external changes.
- [ ] **Lazy entry enrichment**: size/mtime for huge dirs after initial render.
- [ ] **Google Drive folder support**: ~~entering the mount~~ (fixed: dotted dir names dropped their extension) and ~~drive bar entry~~ (fixed: `~/Library/CloudStorage` is scanned) — still to do: handle File Provider placeholder files (size/date from metadata, download-on-open).
- [ ] **Symlink handling**: show target, Cmd+Enter to follow vs open.
- [ ] **Permission errors**: surface as inline banner, not `alert()`. (Done for navigation; mutation ops still use `alert()`.)
- [ ] **Progress dialog** ETA + bytes/sec.
- [ ] **Large-selection performance**: virtualize selection rendering past N entries.

## Tests

- [x] Component tests for the command line (Enter, Escape, Up/Down blur→cursor, Tab completion).
- [ ] Component tests for the favorites picker and context menu.
- [ ] Integration smoke test that drives the app via Playwright / spectron successor.
- [ ] Unit tests for `ops` runner conflict matrix (overwrite / skip / rename / apply-to-all).

## Docs

- [ ] Screenshot + short demo GIF in `docs/` for the README.
- [ ] Keybinding reference page exported from `src/renderer/keybindings` so it can't drift.
- [ ] Contributing guide (branch naming, commit style, milestone flow).

## Nice-to-haves

- [ ] Plugin API — user scripts that register commands and panels.
- [ ] FTP / SFTP / SMB virtual panels.
- [ ] Git status column in panels.
- [ ] Google Drive / iCloud Drive / OneDrive / Dropbox awareness (show sync state).

