# GranderCommander — TODO

Rolling list of what's next. Grouped by milestone. Check off as we ship.

## M3 — Power user

- [ ] **Archives**: open `.zip` / `.tar.gz` / `.7z` as a virtual panel (enter, extract selection, create).
- [ ] **Multi-rename tool**: regex find/replace, counter `{n}`, case transforms, preview table, dry-run diff.
- [ ] **File compare**: diff two marked files side-by-side (use `diff` + a simple viewer).
- [ ] **Folder sync**: dual-panel diff — left-only / right-only / differ / same, with Copy-missing and Mirror actions.
- [ ] **Search panel**: `Cmd+F` opens a global search (name + content regex, size/date filters), results materialise as a virtual panel.
- [ ] **Tabbed panels**: per-panel tabs with `Cmd+T` / `Cmd+W` / `Cmd+{1..9}`.
- [ ] **Bookmarks with hotkeys**: `Ctrl+1..9` to jump, `Ctrl+Shift+1..9` to set.
- [ ] **Internal viewer**: `F3` opens a read-only viewer with text / hex / image modes.
- [ ] **Drag and drop** between panels and to/from Finder.
- [ ] **Command-line completion**: path + executable completion for the bottom cmdline.

## M4 — Release

- [ ] **Auto-update** via electron-updater on a private S3 bucket.
- [ ] **Proper update mechanism**, like orca ([https://github.com/stablyai/orca](https://github.com/stablyai/orca)): electron-updater with a generic feed pointed at GitHub Releases (`/releases/latest/download`), re-pinned per check to a concrete tag URL to avoid redirect drift. Local reference: `/Users/grnd/projects/agent-orchestrators/orca/src/main/updater.ts`. Supersedes the S3 idea above — we already publish DMGs via the GitHub release workflow.
- [ ] **Crash reporting** (Sentry or Crashpad).
- [ ] **CI**: GitHub Actions — typecheck + lint + test on PRs; release job on tags.
- [ ] **Icon + DMG background polish**: current icon is a dog-with-shield placeholder.
- [ ] **App Store-ready build**? (Evaluate sandbox restrictions on fs access.)
- [ ] **Code signing + notarization** for `.dmg` (Developer ID).

## Polish / UX

- [ ] **Theme system**: light / dark / classic TC blue, user-overridable via `theme.json`.
- [ ] **Density toggle**: compact / comfortable row heights.
- [ ] **Column chooser**: show/hide/reorder columns per panel.
- [ ] **Per-panel sort persistence** across restarts.
- [ ] **Remember window size + splitter ratio** across launches.
- [ ] **Breadcrumb path bar** in addition to the editable one.
- [ ] **Inline rename** (press `F2` rename should also work as click-click-slow on selected row? TBD).
- [ ] **Keyboard-configurable shortcuts** (`settings.json`).
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

- [ ] Component tests for the command line (Enter, Escape, Up/Down blur→cursor).
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

