// src/renderer/commands/index.ts
export type CommandName =
  | 'cursorUp' | 'cursorDown' | 'cursorPageUp' | 'cursorPageDown' | 'cursorHome' | 'cursorEnd'
  | 'markAndDown' | 'markAndUp'
  | 'navigateInto' | 'navigateUp'
  | 'toggleMark' | 'selectAll' | 'clearSelection'
  | 'switchActive' | 'swapPanels' | 'sameDirToOther' | 'sameDirFromOther'
  | 'sortByName' | 'sortByExt' | 'sortBySize' | 'sortByDate'
  | 'toggleHidden'
  | 'refresh'
  | 'focusPathBar'
  | 'mkdir' | 'rename' | 'copy' | 'move' | 'trash' | 'deleteConfirm';
