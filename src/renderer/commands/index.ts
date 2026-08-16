// src/renderer/commands/index.ts

/** The 1..9 range shared by numbered bookmarks (Ctrl+N) and tabs (Cmd+N). */
export type Digit1To9 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type BookmarkSlot = Digit1To9;

export type CommandName =
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
  | 'mkdir' | 'rename' | 'copy' | 'move' | 'trash' | 'deleteConfirm' | 'deleteCursorConfirm'
  | 'duplicate' | 'copyPath'
  | 'addToFavorites' | 'pickFavorite'
  | 'quickLook' | 'openTerminal' | 'quitApp' | 'runShellCommand'
  | 'toggleTerminal'
  | 'viewFile' | 'toggleQuickView'
  | 'multiRename' | 'compareFiles' | 'syncFolders'
  | 'openSearch' | 'revealInPanel';
