/** The 1..9 range shared by numbered bookmarks (Ctrl+N) and tabs (Cmd+N). */
export type Digit1To9 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type BookmarkSlot = Digit1To9;

export type CommandId =
  | `gotoBookmark${BookmarkSlot}`
  | `setBookmark${BookmarkSlot}`
  | `selectTab${Digit1To9}`
  | 'newTab' | 'closeTab'
  | 'cursorUp' | 'cursorDown' | 'cursorPageUp' | 'cursorPageDown' | 'cursorHome' | 'cursorEnd'
  | 'markAndDown' | 'markAndUp'
  | 'navigateInto' | 'navigateUp'
  | 'toggleMark' | 'selectAll' | 'clearSelection'
  | 'switchActive' | 'swapPanels' | 'sameDirToOther' | 'sameDirFromOther'
  | 'sortByName' | 'sortByExt' | 'sortBySize' | 'sortByDate'
  | 'toggleHidden'
  | 'refresh'
  | 'focusPathBar' | 'focusPathBarRoot'
  | 'mkdir' | 'newFile' | 'rename' | 'copy' | 'move' | 'trash' | 'deleteConfirm' | 'deleteCursorConfirm'
  | 'duplicate' | 'copyPath'
  | 'addToFavorites' | 'pickFavorite'
  | 'quickLook' | 'openTerminal' | 'quitApp' | 'runShellCommand'
  | 'toggleTerminal'
  | 'viewFile' | 'editFile' | 'toggleQuickView'
  | 'multiRename' | 'compareFiles' | 'syncFolders'
  | 'openSearch' | 'revealInPanel' | 'packArchive'
  // Phase 0 additions: actions that existed only as private component handlers,
  // plus the two router branches that became commands.
  | 'viewerScrollDown' | 'viewerScrollUp' | 'viewerScrollLeft' | 'viewerScrollRight'
  | 'viewerPageDown' | 'viewerPageUp' | 'viewerDocStart' | 'viewerDocEnd' | 'viewerClose'
  | 'editorSave' | 'editorClose'
  | 'eraseCommandLineOrParent' | 'toggleCheatsheet';

/** Commands a mounted surface owns; dispatch routes these to its handlers. */
export const SURFACE_COMMAND_IDS = [
  'viewerScrollDown', 'viewerScrollUp', 'viewerScrollLeft', 'viewerScrollRight',
  'viewerPageDown', 'viewerPageUp', 'viewerDocStart', 'viewerDocEnd', 'viewerClose',
  'editorSave', 'editorClose',
] as const satisfies readonly CommandId[];
