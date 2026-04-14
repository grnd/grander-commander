# GranderCommander

Total Commander-style file manager for macOS.

## Status

M2 complete. Supports mkdir (F7 / Cmd+N), rename (F2 / Cmd+Shift+R), copy (F5 / Cmd+C), move (F6 / Cmd+X), trash (F8 / Cmd+Delete), permanent delete (Shift+F8 / Cmd+Shift+Delete), with Overwrite / Skip / Rename / Apply-to-all conflict handling and cancellable progress.

## Develop

Prereq: Node 20+.

```bash
npm install
npm run dev         # launches Electron in dev mode
npm test            # vitest
npm run typecheck   # tsc --noEmit for main/preload/renderer
npm run lint        # eslint
```

## Build a `.dmg`

```bash
npm run build
```

(Signing + notarization come in M4.)

## Layout

- `src/main` — Node process: fs I/O, volumes, IPC, ops runner.
- `src/preload` — `contextBridge` definition of `window.gc`.
- `src/renderer` — React + Zustand UI (components, commands, keybindings, dialogs, theme).
- `src/shared` — types shared across all three.
- `tests` — Vitest unit + component tests.
- `docs/superpowers/specs` — design spec.
- `docs/superpowers/plans` — milestone implementation plans.

## Manual smoke checklist (M2)

Launch `npm run dev` and verify each case in both panels:

**Mouse (Windows mode):**
- Single click → cursor moves, selection cleared.
- Cmd+click → toggles selection on that row.
- Shift+click → range selects from cursor to clicked row.
- Double-click a folder → navigates in.
- Double-click a file → opens in default macOS app.
- Drag the splitter between panels → panels resize; double-click splitter resets 50/50.

**Keyboard navigation:**
- ArrowUp/Down moves cursor; PageUp/Down jumps 20 rows; Home/End first/last.
- Enter on folder navigates in; on file opens it.
- Backspace → parent (no-op at `/`).
- Tab switches active panel.
- Ctrl+U / Cmd+U swaps panels.
- Cmd+Right copies active path into inactive; Cmd+Left copies inactive into active.
- Space / Insert toggles mark on cursor; Shift+Arrow marks and moves.
- Cmd+A selects all (except `..`). Escape clears selection.
- Click column header toggles sort; Ctrl+F3/F4/F5/F6 sort by name/ext/size/date.
- Ctrl+H toggles hidden; `.DS_Store`/`Icon\r` never appear.
- Ctrl+R / Cmd+R refreshes active panel.
- Cmd+L focuses the path bar; Enter navigates and returns focus; Escape cancels.

**Mutations (M2):**
1. **F7 / Cmd+N**: dialog opens; type name + Enter creates folder; panel refreshes.
2. **F2 / Cmd+Shift+R** on a single file: rename dialog opens with filename prefilled, stem pre-selected; Enter renames and panel refreshes.
3. **F5 / Cmd+C**: mark a file, press F5; copy dialog opens prefilled with inactive panel path; Enter triggers progress dialog; both panels refresh on complete.
4. **F5 into a dir containing the same name**: overwrite prompt appears; test Skip (preserves dst), Overwrite (replaces dst), Rename (prompts for new name).
5. **F6 / Cmd+X**: same-volume move is instant; cross-device falls back to copy+trash with progress.
6. **F8 / Cmd+Delete**: moves to macOS Trash silently; verify via Finder Trash.
7. **Shift+F8 / Cmd+Shift+Delete**: confirm dialog; Cancel leaves file; OK deletes permanently.
8. **Large file copy**: progress bar advances; Cancel aborts immediately; partial dst file removed.
9. **Menu → Files**: each item triggers its shortcut equivalent.
