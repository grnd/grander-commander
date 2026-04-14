# GranderCommander

<p align="center">
  <img src="build/icon.png" alt="GranderCommander" width="160" />
</p>

<p align="center">
  <b>Total Commander-style dual-pane file manager for macOS</b><br/>
  <i>Keyboard-first. Fast. Native-feeling. Built with Electron + React + TypeScript.</i>
</p>

<p align="center">
  <img alt="platform" src="https://img.shields.io/badge/platform-macOS-lightgrey" />
  <img alt="status" src="https://img.shields.io/badge/status-M2%20complete-brightgreen" />
  <img alt="electron" src="https://img.shields.io/badge/electron-30-47848F" />
  <img alt="react" src="https://img.shields.io/badge/react-18-61DAFB" />
  <img alt="typescript" src="https://img.shields.io/badge/typescript-5.4-3178C6" />
</p>

---

## Why

Finder is fine for clicking around. But if you've ever lived inside Total Commander, Far, or Midnight Commander, nothing else feels right: two panels side by side, a cursor you move with the keyboard, a command line glued to the bottom, and every operation one shortcut away. GranderCommander brings that muscle memory to macOS, with native file ops, Quick Look, and Finder-tier trashing.

## Features

### Dual-pane navigation
- **Two panels** side by side with a draggable splitter (double-click to reset 50/50).
- **Windows-mode mouse**: single click moves the cursor, `Cmd+Click` toggles marks, `Shift+Click` range-selects, double-click opens.
- **Quick search** — `Alt+letter` jumps to the next entry whose name starts with what you're typing.
- **TC-style sorting** — click a column header or use `Ctrl+F3/F4/F5/F6` for name / ext / size / date. Toggle hidden files with `Ctrl+H`.
- **Virtualized file list** (`react-window`) scrolls smoothly through directories with thousands of entries.

### File operations (M2)
- **Create / rename / duplicate** folders and files with keyboard shortcuts.
- **Copy (F5)** and **Move (F6)** with a background ops runner, cancellable progress dialog, and per-conflict Overwrite / Skip / Rename / Apply-to-all.
- **Same-volume moves** are instant renames; **cross-device** falls back to copy + trash.
- **Trash (F8)** routes through the native macOS Trash; **Shift+F8** deletes permanently after confirm.
- **Quick Look** preview with the spacebar.
- **Open in Terminal** from any directory.

### Chrome & productivity
- **Drive bar** with mounted volumes and quick jump.
- **Favorites bar** — bookmark directories, pick them from a palette.
- **Path bar** — `Cmd+L` to focus, type a path, `Enter` to jump.
- **Command line** at the bottom of the window — type a shell command, `Enter` runs it in the active panel's cwd, output appears in a modal. `Up/Down` returns focus to the pane and moves the cursor.
- **F-key bar** and a **Cheatsheet overlay** (hold `?`) so you never have to memorize anything.
- **Context menu** on right-click with the full set of file actions.

## Screenshot

_Drop a screenshot into `docs/screenshot.png` and it'll render here._

<!-- ![GranderCommander](docs/screenshot.png) -->

## Install & Run

Requires **Node 20+** and **macOS 12+**.

```bash
npm install
npm run dev          # Electron dev mode with HMR
```

## Build a signed-less `.dmg`

```bash
npm run dist         # arm64 only
npm run dist:universal   # arm64 + x64
```

Output lands in `dist/`. Current builds are unsigned — Gatekeeper will ask you to allow it in System Settings the first time. Code signing and notarization are queued for M4.

## Quality gates

```bash
npm run typecheck    # strict tsc for main / preload / renderer
npm run lint         # eslint
npm test             # vitest unit + component tests
npm run format       # prettier
```

## Keyboard shortcuts

### Navigation
| Keys | Action |
|---|---|
| `↑` `↓` | Move cursor |
| `PgUp` `PgDn` | Jump 20 rows |
| `Home` `End` | First / last entry |
| `Enter` | Open file / enter folder |
| `Backspace` | Parent directory |
| `Tab` | Switch active panel |
| `Cmd+L` | Focus path bar |
| `Cmd+/` | Focus path bar at `/` |
| `Cmd+R` · `Ctrl+R` | Refresh active panel |
| `Alt+letter` | Quick-search in active panel |

### Selection
| Keys | Action |
|---|---|
| `Space` · `Insert` | Toggle mark |
| `Shift+↑` `Shift+↓` | Mark and move |
| `Cmd+A` | Select all |
| `Esc` | Clear selection / quick search |

### Panels
| Keys | Action |
|---|---|
| `Ctrl+U` · `Cmd+U` | Swap panels |
| `Cmd+→` | Copy active path to inactive |
| `Cmd+←` | Copy inactive path to active |
| `Ctrl+F3` / `F4` / `F5` / `F6` | Sort by name / ext / size / date |
| `Ctrl+H` | Toggle hidden files |

### File operations
| Keys | Action |
|---|---|
| `F2` · `Cmd+Shift+R` | Rename |
| `F5` · `Cmd+C` | Copy to other panel |
| `F6` · `Cmd+X` | Move to other panel |
| `F7` · `Cmd+N` | New folder |
| `F8` · `Cmd+Delete` | Move to Trash |
| `Shift+F8` · `Cmd+Shift+Delete` | Delete permanently |
| `Space` (on file) | Quick Look |

Hold `?` anywhere in the app for the full cheatsheet.

## Architecture

```
src/
  main/         Node process — fs, volumes, IPC, background ops
  preload/      contextBridge → window.gc
  renderer/    React + Zustand UI
    commands/   pure commands (navigation, selection, mutations, sort, panels)
    components/ Panel, FileList, PathBar, CommandLine, dialogs, …
    state/      Zustand store (panels, favorites, dialogs, quick search)
    keybindings combo → CommandName lookup
  shared/       types shared between main / preload / renderer
tests/          vitest (jsdom for components)
```

**Design principle:** commands are pure functions that take `(panel, ctx)` and return side-effectful work through a small API surface (`window.gc`). Keybindings, menus, F-key bar, and context menus all dispatch the same `CommandName` — one vocabulary, one implementation.

## Roadmap

See [`todo.md`](./todo.md) for the running list of what's next.

## License

[MIT](./LICENSE) © grnd
