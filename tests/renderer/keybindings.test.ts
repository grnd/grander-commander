// tests/renderer/keybindings.test.ts
import { describe, it, expect } from 'vitest';
import { eventToCombo, lookup, allowedFromInput, bindings, BOOKMARK_SLOTS } from '@renderer/keybindings';

const mkEvent = (init: Partial<KeyboardEvent>): KeyboardEvent => {
  return new KeyboardEvent('keydown', {
    key: init.key ?? '',
    code: init.code ?? '',
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
  });
};

describe('eventToCombo', () => {
  it('bare F5', () => expect(eventToCombo(mkEvent({ key: 'F5' }))).toBe('F5'));
  it('Cmd+C', () => expect(eventToCombo(mkEvent({ key: 'c', metaKey: true }))).toBe('Cmd+C'));
  it('Ctrl+Shift+H', () =>
    expect(eventToCombo(mkEvent({ key: 'h', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+H'));
  it('Space', () => expect(eventToCombo(mkEvent({ key: ' ' }))).toBe('Space'));
  it('bare modifier returns null', () =>
    expect(eventToCombo(mkEvent({ key: 'Meta', metaKey: true }))).toBeNull());

  // Shift+1 reports key "!" on a US layout and something else on others, so a
  // digit combo has to come from the physical key or Ctrl+Shift+1 is unbindable.
  it('reads digits from the physical key, not the shifted character', () => {
    expect(eventToCombo(mkEvent({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true })))
      .toBe('Ctrl+Shift+1');
  });

  it('reads an unshifted digit the same way', () => {
    expect(eventToCombo(mkEvent({ key: '3', code: 'Digit3', ctrlKey: true }))).toBe('Ctrl+3');
  });
});

describe('bookmark bindings', () => {
  it('binds jump and set for every slot', () => {
    for (const n of BOOKMARK_SLOTS) {
      expect(lookup(`Ctrl+${n}`)).toBe(`gotoBookmark${n}`);
      expect(lookup(`Ctrl+Shift+${n}`)).toBe(`setBookmark${n}`);
    }
  });

  it('does not double-bind any combo', () => {
    const combos = bindings.map((b) => b.combo);
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('lets bookmark combos through while an input has focus', () => {
    expect(allowedFromInput('Ctrl+1')).toBe(true);
    expect(allowedFromInput('Ctrl+Shift+1')).toBe(true);
  });
});

describe('lookup', () => {
  it('F5 maps to copy', () => expect(lookup('F5')).toBe('copy'));
  it('ArrowDown maps to cursorDown', () => expect(lookup('ArrowDown')).toBe('cursorDown'));
  it('Cmd+A maps to selectAll', () => expect(lookup('Cmd+A')).toBe('selectAll'));
  it('unknown combo returns null', () => expect(lookup('Ctrl+Z')).toBeNull());
});

describe('allowedFromInput', () => {
  // The global router redirects any unmapped printable key into the command
  // line, so typing one letter used to kill every shortcut until you clicked
  // back into a panel. App shortcuts must survive a focused input.
  it('lets the terminal toggle through', () =>
    expect(allowedFromInput('Ctrl+`')).toBe(true));
  it('lets function keys through', () => {
    expect(allowedFromInput('F5')).toBe(true);
    expect(allowedFromInput('F8')).toBe(true);
    expect(allowedFromInput('Shift+F8')).toBe(true);
  });
  it('lets other modifier combos through', () => {
    expect(allowedFromInput('Cmd+R')).toBe(true);
    expect(allowedFromInput('Ctrl+H')).toBe(true);
    expect(allowedFromInput('Cmd+G')).toBe(true);
  });

  // These mean something else entirely inside a text field. Hijacking them
  // would make Cmd+C copy files instead of text, and Cmd+Backspace pop a
  // delete-files confirm while the user is editing a path.
  it('leaves macOS text-editing combos to the input', () => {
    for (const c of ['Cmd+A', 'Cmd+C', 'Cmd+X', 'Cmd+V', 'Cmd+Backspace', 'Cmd+Delete',
                     'Cmd+ArrowLeft', 'Cmd+ArrowRight', 'Cmd+ArrowUp', 'Cmd+ArrowDown',
                     'Alt+ArrowLeft', 'Alt+Backspace']) {
      expect(allowedFromInput(c), `${c} must stay with the input`).toBe(false);
    }
  });

  it('leaves plain keys to the input', () => {
    for (const c of ['Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'Space', '/', 'Tab', 'Backspace']) {
      expect(allowedFromInput(c), `${c} must stay with the input`).toBe(false);
    }
  });
});
