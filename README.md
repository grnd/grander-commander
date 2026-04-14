# GranderCommander

Total Commander-style file manager for macOS.

## Status

M1 — walking skeleton. Read-only dual-pane browser. No copy/move/delete yet.

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

- `src/main` — Node process: fs I/O, volumes, IPC.
- `src/preload` — `contextBridge` definition of `window.gc`.
- `src/renderer` — React + Zustand UI.
- `src/shared` — types shared across all three.
- `tests` — Vitest unit + component tests.
- `docs/superpowers/specs` — design spec.
- `docs/superpowers/plans` — milestone implementation plans.

## M1 manual smoke checklist

Launch `npm run dev` and verify in both panels:

**Mouse (Windows mode):**
- Single click → cursor moves, selection cleared.
- Cmd+click → toggles selection on that row.
- Shift+click → range selects from cursor to clicked row.
- Double-click a folder → navigates in.
- Double-click a file → opens in default macOS app.
- Drag the splitter between panels → panels resize; double-click splitter resets 50/50.

**Keyboard:**
- ArrowUp/Down moves cursor; PageUp/Down jumps 20 rows; Home/End first/last.
- Enter on a folder navigates in; on a file opens it.
- Backspace navigates to parent (no-op at `/`).
- Tab switches the active panel (blue outline moves).
- Ctrl+U or Cmd+U swaps left and right panels.
- Cmd+Right copies active panel path into the inactive panel.
- Cmd+Left copies inactive panel path into the active panel.
- Space / Insert toggles mark on cursor row; Shift+Arrow marks and moves.
- Cmd+A selects all entries (except `..`). Escape clears selection.
- Click column header toggles sort direction for that column.
- Ctrl+F3/F4/F5/F6 sort by name/ext/size/date.
- Ctrl+H toggles hidden-files visibility. `.DS_Store` and `Icon\r` never appear.
- Ctrl+R / Cmd+R refreshes the active panel.
- Typing a path in the path bar and pressing Enter navigates there; Escape reverts.
