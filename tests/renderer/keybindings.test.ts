// tests/renderer/keybindings.test.ts
import { describe, it, expect } from 'vitest';
import { eventToCombo, lookup } from '@renderer/keybindings';

const mkEvent = (init: Partial<KeyboardEvent>): KeyboardEvent => {
  return new KeyboardEvent('keydown', {
    key: init.key ?? '',
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
});

describe('lookup', () => {
  it('F5 maps to copy', () => expect(lookup('F5')).toBe('copy'));
  it('ArrowDown maps to cursorDown', () => expect(lookup('ArrowDown')).toBe('cursorDown'));
  it('Cmd+A maps to selectAll', () => expect(lookup('Cmd+A')).toBe('selectAll'));
  it('unknown combo returns null', () => expect(lookup('Ctrl+Z')).toBeNull());
});
