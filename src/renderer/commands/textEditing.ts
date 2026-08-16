// src/renderer/commands/textEditing.ts

type TextField = HTMLInputElement | HTMLTextAreaElement;

/**
 * Clipboard and selection editing inside a focused text field.
 *
 * On macOS these actions are performed by the Edit menu, not by the web page:
 * a key combination with no matching menu item never becomes an editing
 * command, which is why a menu without an Edit submenu leaves text fields
 * unable to paste. The app's menu registers Cmd+V and the undo pair, but
 * deliberately does *not* register Cmd+C / Cmd+X / Cmd+A — those belong to the
 * panels, for copying, moving and selecting files. So a focused text field has
 * to apply that trio by hand.
 *
 * Returns true when the combination was consumed.
 */
export function applyTextEditing(combo: string, el: TextField): boolean {
  if (combo === 'Cmd+A') {
    el.select();
    return true;
  }
  if (combo !== 'Cmd+C' && combo !== 'Cmd+X') return false;

  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  // Nothing selected: still swallow it, so Cmd+C in a text field never falls
  // through and copies files instead.
  if (start === end) return true;

  const action = combo === 'Cmd+C' ? 'copy' : 'cut';
  // execCommand is deprecated but is the only *synchronous* path, and it emits
  // the input event a controlled React field needs in order to notice a cut.
  let handled = false;
  try {
    handled = document.execCommand(action);
  } catch {
    handled = false;
  }
  if (!handled) {
    // Fallback: the clipboard still gets the text, and a cut is completed by
    // splicing the field itself.
    void navigator.clipboard?.writeText(el.value.slice(start, end));
    if (action === 'cut') spliceOut(el, start, end);
  }
  return true;
}

/**
 * Remove [start, end) from a controlled field. Assigning `.value` directly is
 * invisible to React, so this goes through the native setter and then fires the
 * input event React listens for.
 */
function spliceOut(el: TextField, start: number, end: number): void {
  const next = el.value.slice(0, start) + el.value.slice(end);
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.setSelectionRange(start, start);
}
