// src/renderer/keybindings.ts
import type { CommandName } from './commands';

export type KeyCombo = string; // canonical string: "F5", "Cmd+C", "Ctrl+Shift+H", ...

export type Binding = { combo: KeyCombo; command: CommandName };

export const bindings: Binding[] = [
  { combo: 'ArrowUp', command: 'cursorUp' },
  { combo: 'ArrowDown', command: 'cursorDown' },
  { combo: 'PageUp', command: 'cursorPageUp' },
  { combo: 'PageDown', command: 'cursorPageDown' },
  { combo: 'Home', command: 'cursorHome' },
  { combo: 'End', command: 'cursorEnd' },
  { combo: 'Enter', command: 'navigateInto' },
  { combo: 'Backspace', command: 'navigateUp' },
  { combo: 'Tab', command: 'switchActive' },
  { combo: 'Ctrl+U', command: 'swapPanels' },
  { combo: 'Cmd+U', command: 'swapPanels' },
  { combo: 'Cmd+ArrowLeft', command: 'sameDirFromOther' },
  { combo: 'Cmd+ArrowRight', command: 'sameDirToOther' },
  { combo: 'Insert', command: 'markAndDown' },
  { combo: 'Space', command: 'quickLook' },
  { combo: 'Shift+Space', command: 'toggleMark' },
  { combo: 'Shift+ArrowDown', command: 'markAndDown' },
  { combo: 'Shift+ArrowUp', command: 'markAndUp' },
  { combo: 'Cmd+ArrowDown', command: 'cursorEnd' },
  { combo: 'Cmd+ArrowUp', command: 'cursorHome' },
  { combo: 'Cmd+A', command: 'selectAll' },
  { combo: 'Escape', command: 'clearSelection' },
  { combo: 'Ctrl+F3', command: 'sortByName' },
  { combo: 'Ctrl+F4', command: 'sortByExt' },
  { combo: 'Ctrl+F5', command: 'sortBySize' },
  { combo: 'Ctrl+F6', command: 'sortByDate' },
  { combo: 'Ctrl+H', command: 'toggleHidden' },
  { combo: 'Ctrl+R', command: 'refresh' },
  { combo: 'Cmd+R', command: 'refresh' },
  { combo: 'Cmd+L', command: 'focusPathBar' },
  { combo: '/', command: 'focusPathBarRoot' },
  { combo: 'F7', command: 'mkdir' },
  { combo: 'Cmd+N', command: 'mkdir' },
  { combo: 'F5', command: 'copy' },
  { combo: 'F6', command: 'move' },
  { combo: 'F8', command: 'trash' },
  { combo: 'Shift+F8', command: 'deleteConfirm' },
  { combo: 'Cmd+Backspace', command: 'deleteCursorConfirm' },
  { combo: 'F2', command: 'rename' },
  { combo: 'Cmd+Shift+R', command: 'rename' },
  { combo: 'Cmd+C', command: 'copy' },
  { combo: 'Cmd+X', command: 'move' },
  { combo: 'Cmd+Delete', command: 'trash' },
  { combo: 'Cmd+Shift+Delete', command: 'deleteConfirm' },
  { combo: 'Cmd+Shift+F', command: 'addToFavorites' },
  { combo: 'Ctrl+Shift+F', command: 'addToFavorites' },
  { combo: 'Cmd+/', command: 'pickFavorite' },
  { combo: 'Cmd+G', command: 'pickFavorite' },
  { combo: 'Cmd+S', command: 'openTerminal' },
];

// Convert a KeyboardEvent to its canonical combo string.
export function eventToCombo(e: KeyboardEvent): KeyCombo | null {
  const parts: string[] = [];
  if (e.metaKey) parts.push('Cmd');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const key = e.key;
  // Ignore bare modifiers
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null;

  // Normalize space
  const normKey = key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key;
  parts.push(normKey);
  return parts.join('+');
}

export function lookup(combo: KeyCombo): CommandName | null {
  const found = bindings.find((b) => b.combo === combo);
  return found?.command ?? null;
}
