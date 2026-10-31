import { SURFACE_COMMAND_IDS, type BookmarkSlot, type CommandId, type Digit1To9 } from './ids';
import type { KeyId } from '../keys/identity';
import type { Bindings } from '../keymap/lookup';

export type Context = 'global' | 'panel' | 'input' | 'viewer' | 'editor' | 'terminal' | 'quickSearch';
export type Surface = 'viewer' | 'editor';
export type Category =
  | 'Navigation' | 'Selection' | 'Files' | 'Panels' | 'View' | 'Tabs' | 'Bookmarks' | 'Tools';

export type CommandMeta = {
  id: CommandId;
  label: string;
  category: Category;
  /** Where this command's own keys live. */
  context: Context;
  defaults: KeyId[];
  /**
   * Keys the same command holds in another context. `trash` needs F8 app-wide
   * but Cmd+Delete only in the panel, because inside a text field that combo
   * deletes to the end of the line.
   */
  alsoIn?: Partial<Record<Context, KeyId[]>>;
  /** Set when a mounted component owns the action rather than `dispatch`. */
  surface?: Surface;
  /** The OS or the web platform owns this key; not bindable. */
  system?: true;
  /** Needs arguments, so a bare key cannot invoke it; not bindable. */
  requiresArgs?: true;
  /**
   * Runs in any state, modal or not. Settings needs this: a keymap that locks
   * the owner out has to stay repairable from the keyboard.
   */
  alwaysAvailable?: true;
};

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const bookmarks: CommandMeta[] = SLOTS.flatMap((n: BookmarkSlot): CommandMeta[] => [
  { id: `gotoBookmark${n}`, label: `Go to bookmark ${n}`, category: 'Bookmarks',
    context: 'global', defaults: [`Ctrl+${n}`] },
  { id: `setBookmark${n}`, label: `Set bookmark ${n} to this folder`, category: 'Bookmarks',
    context: 'global', defaults: [`Ctrl+Shift+${n}`] },
]);

const tabs: CommandMeta[] = SLOTS.map((n: Digit1To9): CommandMeta => ({
  id: `selectTab${n}`, label: `Select tab ${n}`, category: 'Tabs',
  context: 'global', defaults: [`Cmd+${n}`],
}));

export const CATALOG: readonly CommandMeta[] = [
  // Navigation — bare keys stay in `panel` so they do not fire while typing.
  { id: 'cursorUp', label: 'Cursor up', category: 'Navigation', context: 'panel', defaults: ['ArrowUp'] },
  { id: 'cursorDown', label: 'Cursor down', category: 'Navigation', context: 'panel', defaults: ['ArrowDown'] },
  { id: 'cursorPageUp', label: 'Cursor page up', category: 'Navigation', context: 'panel', defaults: ['PageUp'] },
  { id: 'cursorPageDown', label: 'Cursor page down', category: 'Navigation', context: 'panel', defaults: ['PageDown'] },
  { id: 'cursorHome', label: 'First row', category: 'Navigation', context: 'panel', defaults: ['Home', 'Cmd+ArrowUp'] },
  { id: 'cursorEnd', label: 'Last row', category: 'Navigation', context: 'panel', defaults: ['End', 'Cmd+ArrowDown'] },
  { id: 'navigateInto', label: 'Open', category: 'Navigation', context: 'panel', defaults: ['Enter'] },
  { id: 'navigateUp', label: 'Parent folder', category: 'Navigation', context: 'panel', defaults: [] },
  { id: 'eraseCommandLineOrParent', label: 'Erase the command line, or parent folder',
    category: 'Navigation', context: 'panel', defaults: ['Backspace'] },
  { id: 'focusPathBar', label: 'Focus the path bar', category: 'Navigation', context: 'global', defaults: ['Cmd+L'] },
  { id: 'focusPathBarRoot', label: 'Focus the path bar at root', category: 'Navigation', context: 'panel', defaults: ['Slash'] },
  { id: 'revealInPanel', label: 'Reveal in the panel', category: 'Navigation', context: 'global', defaults: ['Cmd+Enter'] },

  // Selection
  { id: 'toggleMark', label: 'Mark or unmark', category: 'Selection', context: 'panel', defaults: ['Shift+Space'] },
  { id: 'markAndDown', label: 'Mark and move down', category: 'Selection', context: 'panel', defaults: ['Insert', 'Shift+ArrowDown'] },
  { id: 'markAndUp', label: 'Mark and move up', category: 'Selection', context: 'panel', defaults: ['Shift+ArrowUp'] },
  { id: 'selectAll', label: 'Select all', category: 'Selection', context: 'global', defaults: ['Cmd+A'] },
  { id: 'clearSelection', label: 'Clear the selection', category: 'Selection', context: 'panel', defaults: ['Escape'] },

  // Files
  { id: 'copy', label: 'Copy to the other pane', category: 'Files', context: 'global', defaults: ['F5', 'Cmd+C'] },
  { id: 'move', label: 'Move to the other pane', category: 'Files', context: 'global', defaults: ['F6', 'Cmd+X'] },
  { id: 'trash', label: 'Move to Trash', category: 'Files', context: 'global', defaults: ['F8'],
    alsoIn: { panel: ['Cmd+Delete'] } },
  { id: 'deleteConfirm', label: 'Delete permanently…', category: 'Files', context: 'global',
    defaults: ['Shift+F8', 'Cmd+Shift+Delete'] },
  { id: 'deleteCursorConfirm', label: 'Delete this file permanently…', category: 'Files',
    context: 'panel', defaults: ['Cmd+Backspace'] },
  { id: 'mkdir', label: 'New folder', category: 'Files', context: 'global', defaults: ['F7', 'Cmd+N'] },
  { id: 'newFile', label: 'New file', category: 'Files', context: 'global', defaults: ['Shift+F4'] },
  { id: 'rename', label: 'Rename', category: 'Files', context: 'global', defaults: ['F2', 'Cmd+Shift+R'] },
  { id: 'duplicate', label: 'Duplicate', category: 'Files', context: 'global', defaults: [] },
  { id: 'copyPath', label: 'Copy the full path', category: 'Files', context: 'global', defaults: [] },
  { id: 'packArchive', label: 'Pack into an archive', category: 'Files', context: 'global', defaults: ['Alt+F5', 'Cmd+Shift+P'] },

  // Panels
  { id: 'switchActive', label: 'Other pane', category: 'Panels', context: 'panel', defaults: ['Tab'] },
  { id: 'swapPanels', label: 'Swap the panes', category: 'Panels', context: 'global', defaults: ['Ctrl+U', 'Cmd+U'] },
  { id: 'sameDirToOther', label: 'Send this folder to the other pane', category: 'Panels',
    context: 'panel', defaults: ['Cmd+ArrowRight'] },
  { id: 'sameDirFromOther', label: 'Take the other pane’s folder', category: 'Panels',
    context: 'panel', defaults: ['Cmd+ArrowLeft'] },

  // View
  { id: 'sortByName', label: 'Sort by name', category: 'View', context: 'global', defaults: ['Ctrl+F3'] },
  { id: 'sortByExt', label: 'Sort by extension', category: 'View', context: 'global', defaults: ['Ctrl+F4'] },
  { id: 'sortBySize', label: 'Sort by size', category: 'View', context: 'global', defaults: ['Ctrl+F5'] },
  { id: 'sortByDate', label: 'Sort by date', category: 'View', context: 'global', defaults: ['Ctrl+F6'] },
  { id: 'toggleHidden', label: 'Show hidden files', category: 'View', context: 'global', defaults: ['Ctrl+H'] },
  { id: 'refresh', label: 'Refresh', category: 'View', context: 'global', defaults: ['Ctrl+R', 'Cmd+R'] },
  { id: 'toggleQuickView', label: 'Quick view in the other pane', category: 'View', context: 'global', defaults: ['Ctrl+Q'] },
  { id: 'quickLook', label: 'Quick Look', category: 'View', context: 'panel', defaults: ['Space'] },
  { id: 'viewFile', label: 'View', category: 'View', context: 'global', defaults: ['F3'] },
  { id: 'editFile', label: 'Edit', category: 'View', context: 'global', defaults: ['F4'] },
  { id: 'toggleCheatsheet', label: 'Shortcut cheatsheet', category: 'View', context: 'panel', defaults: ['Shift+Slash'] },

  // Tabs
  { id: 'newTab', label: 'New tab', category: 'Tabs', context: 'global', defaults: ['Cmd+T'] },
  { id: 'closeTab', label: 'Close tab', category: 'Tabs', context: 'global', defaults: ['Cmd+W'] },

  // Tools
  { id: 'addToFavorites', label: 'Add to favorites', category: 'Tools', context: 'global', defaults: ['Cmd+Shift+F', 'Ctrl+Shift+F'] },
  { id: 'pickFavorite', label: 'Favorites…', category: 'Tools', context: 'global', defaults: ['Cmd+Slash', 'Cmd+G'] },
  { id: 'openTerminal', label: 'Open Terminal here', category: 'Tools', context: 'global', defaults: ['Cmd+S', 'F9'] },
  { id: 'toggleTerminal', label: 'Toggle the built-in terminal', category: 'Tools',
    context: 'global', defaults: ['Ctrl+Backquote'],
    // Also in `terminal`: it is the way out of a pane that otherwise keeps
    // every non-Cmd key for the shell.
    alsoIn: { terminal: ['Ctrl+Backquote'] } },
  { id: 'multiRename', label: 'Multi-rename…', category: 'Tools', context: 'global', defaults: ['Ctrl+M', 'Cmd+Shift+M'] },
  { id: 'compareFiles', label: 'Compare files', category: 'Tools', context: 'global', defaults: ['Cmd+D'] },
  { id: 'syncFolders', label: 'Synchronise folders…', category: 'Tools', context: 'global', defaults: ['Cmd+Y'] },
  { id: 'openSearch', label: 'Search…', category: 'Tools', context: 'global', defaults: ['Cmd+F', 'Alt+F7'] },
  { id: 'quitApp', label: 'Quit', category: 'Tools', context: 'global', defaults: [] },
  { id: 'openSettings', label: 'Settings…', category: 'Tools', context: 'global',
    defaults: ['Cmd+Comma'], alwaysAvailable: true },
  { id: 'runShellCommand', label: 'Run a shell command', category: 'Tools', context: 'global', defaults: [], requiresArgs: true },

  // Viewer surface
  { id: 'viewerScrollDown', label: 'Scroll down', category: 'View', context: 'viewer', defaults: ['ArrowDown'], surface: 'viewer' },
  { id: 'viewerScrollUp', label: 'Scroll up', category: 'View', context: 'viewer', defaults: ['ArrowUp'], surface: 'viewer' },
  { id: 'viewerScrollRight', label: 'Scroll right', category: 'View', context: 'viewer', defaults: ['ArrowRight'], surface: 'viewer' },
  { id: 'viewerScrollLeft', label: 'Scroll left', category: 'View', context: 'viewer', defaults: ['ArrowLeft'], surface: 'viewer' },
  { id: 'viewerPageDown', label: 'Page down', category: 'View', context: 'viewer', defaults: ['PageDown', 'Space'], surface: 'viewer' },
  { id: 'viewerPageUp', label: 'Page up', category: 'View', context: 'viewer', defaults: ['PageUp'], surface: 'viewer' },
  { id: 'viewerDocStart', label: 'Top of the page', category: 'View', context: 'viewer', defaults: ['Home'], surface: 'viewer' },
  { id: 'viewerDocEnd', label: 'Bottom of the page', category: 'View', context: 'viewer', defaults: ['End'], surface: 'viewer' },
  // A viewed file is read 256 KiB at a time, so the ends of the *file* are a
  // different move from the ends of the loaded page.
  { id: 'viewerFileStart', label: 'First page of the file', category: 'View', context: 'viewer', defaults: ['Cmd+Home'], surface: 'viewer' },
  { id: 'viewerFileEnd', label: 'Last page of the file', category: 'View', context: 'viewer', defaults: ['Cmd+End'], surface: 'viewer' },
  { id: 'viewerClose', label: 'Close the viewer', category: 'View', context: 'viewer', defaults: ['Escape', 'F3'], surface: 'viewer' },

  // Editor surface
  { id: 'editorSave', label: 'Save', category: 'Files', context: 'editor', defaults: ['Cmd+S', 'Ctrl+S'], surface: 'editor' },
  { id: 'editorClose', label: 'Close the editor', category: 'Files', context: 'editor', defaults: ['Escape'], surface: 'editor' },

  ...bookmarks,
  ...tabs,
];

const BY_ID = new Map<CommandId, CommandMeta>(CATALOG.map((c) => [c.id, c]));

export function commandById(id: CommandId): CommandMeta | undefined {
  return BY_ID.get(id);
}

/** The catalog's defaults, in the shape the keymap file will later override. */
export function defaultBindings(): Bindings {
  const out: Bindings = {};
  const put = (context: Context, id: CommandId, keys: KeyId[]) => {
    const ctx = (out[context] ??= {});
    ctx[id] = [...(ctx[id] ?? []), ...keys];
  };
  for (const c of CATALOG) {
    put(c.context, c.id, c.defaults);
    for (const [context, keys] of Object.entries(c.alsoIn ?? {}) as [Context, KeyId[]][]) {
      put(context, c.id, keys);
    }
  }
  return out;
}

export const SURFACE_IDS = SURFACE_COMMAND_IDS;
