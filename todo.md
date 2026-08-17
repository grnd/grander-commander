# Grander Commander — TODO

Three buckets: what ships next, what is real work but not now, and what is
speculative. Check off as we ship.

## For next release

Safety net first — two releases (v0.1.2, v0.1.6) shipped an app that would not
start, and both would have been caught by running the thing once.

- [ ] **CI on pull requests**: typecheck + lint + test. There is currently *no*
  PR-triggered workflow at all — `release.yml` only fires on `v*` tags, so a PR
  can merge with a red suite and nothing notices until a release is being cut.
- [ ] **Pre-publish smoke gate**: build with `--publish never`, launch the
  packaged `.app`, assert `window.gc` and `.gc-app` exist, *then* publish.
  Requires splitting the single build-and-publish command. This is the check
  that would have caught both blank-window releases.
- [ ] **Mutation ops still use `alert()`** — surface failures as the inline
  banner navigation already uses.
- [ ] **Tabs do not persist** across restarts.
- [ ] **Remember window size + splitter ratio** across launches.
- [ ] **Settings screen**, with a keyboard-shortcuts tab.
- [ ] **Keyboard-configurable shortcuts** (`settings.json`) — the data half of
  the settings screen above.
- [ ] Release notes have a duplicated heading: GitHub emits `## What's Changed`
  and the catch-all category in `.github/release.yml` repeats it as `###`.
  Rename the catch-all to "Other Changes".

### Decisions to make

Both are "we have two things that overlap"; neither is urgent, both delete or
avoid code once decided — which is why they belong before more is built on top.

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

## Later

Real work, just not blocking the next build.

**M3 follow-ups**

- [ ] **Archive write-through**: rename/delete *inside* an archive, and
  drag-drop into one. Today an archive panel is read-only apart from extraction.
- [ ] **Search progress**: results arrive in one capped batch (5000 hits / 30s).
  Streaming them would need an ops-style event bridge.
- [ ] **Pack/extract progress**: the busy dialog is indeterminate because the
  tools report nothing parseable on stdout.

**Correctness / perf**

- [ ] **Watch active directories** with `fs.watch` + debounce; refresh on
  external changes.
- [ ] **Cloud placeholder files**: Google Drive / iCloud / Dropbox store
  dataless placeholders. Entering the mounts is fixed; still to do is showing
  which files are local vs cloud-only and downloading on open. Designed in
  `docs/superpowers/specs/2026-07-26-cloud-storage-design.md` (gitignored, so
  local-only) — detection via `find -flags +dataless`, eviction is iCloud-only.
- [ ] **Symlink handling**: show target, `Cmd+Enter` to follow vs open.
- [ ] **Lazy entry enrichment**: size/mtime for huge dirs after initial render.
- [ ] **Progress dialog** ETA + bytes/sec.
- [ ] **Large-selection performance**: virtualize selection rendering past N
  entries.

**Polish / UX**

- [ ] **Theme system**: light / dark / classic TC blue, user-overridable via
  `theme.json`.
- [ ] **Density toggle**: compact / comfortable row heights.
- [ ] **Column chooser**: show/hide/reorder columns per panel.
- [ ] **Per-panel sort persistence** across restarts.
- [ ] **Breadcrumb path bar** in addition to the editable one.
- [ ] **Inline rename** (`F2` should also work as click-click-slow on the
  selected row? TBD).
- [ ] **Localization scaffolding** (English only for now).

**Release engineering**

- [ ] **Crash reporting** (Sentry or Crashpad).
- [ ] **App Store-ready build**? (Evaluate sandbox restrictions on fs access.)

**Tests**

- [ ] Component tests for the favorites picker and context menu.
- [ ] Unit tests for the `ops` runner conflict matrix (overwrite / skip /
  rename / apply-to-all).

**Docs**

- [ ] Screenshot + short demo GIF in `docs/` for the README.
- [ ] Keybinding reference page exported from `src/renderer/keybindings` so it
  cannot drift.
- [ ] Contributing guide (branch naming, commit style, milestone flow).

## Nice to have

Speculative. None of it is committed to.

- [ ] Plugin API — user scripts that register commands and panels.
- [ ] FTP / SFTP / SMB virtual panels.
- [ ] Git status column in panels.

---

### Shipped

**M3 — Power user** (v0.2.0): archives as virtual panels (`unzip`/`zip`/`tar`,
7-Zip looked up at runtime); multi-rename `Ctrl+M`; file compare `Cmd+D` (in-tree
Myers diff — the output has to be *aligned rows*, which unified-diff text cannot
give back losslessly); folder sync `Cmd+Y`; search `Cmd+F`; tabbed panels
`Cmd+T`/`Cmd+W`/`Cmd+{1..9}`; bookmarks `Ctrl+1..9`; internal viewer `F3`; quick
preview `Ctrl+Q`; drag and drop, including to Finder (`Alt`+drag — Electron's
native drag cannot share a gesture with an in-app HTML5 drag); command-line
completion.

**M4 — Release**: auto-update via electron-updater against GitHub Releases,
re-pinned per check to a concrete tag URL; Developer ID signing + notarization
with hardened runtime and entitlements, all five repo secrets set and every
release from v0.1.4 signed by CI; app icon and DMG background; generated
"What's Changed" release notes.

**Navigation fixes**: symlinked directories are enterable (`~/Google Drive`);
dotted directory names no longer lose their extension; `~/Library/CloudStorage`
mounts appear in the drive bar; navigation errors surface instead of failing
silently.

**Tests**: command line (Enter, Escape, Up/Down blur→cursor, Tab completion).
