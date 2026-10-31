import { describe, it, expect } from 'vitest';
import { keyIdFromEvent, keyIdParts, isKeyId } from '@shared/keys/identity';

const ev = (init: Partial<KeyboardEvent>) => new KeyboardEvent('keydown', {
  key: init.key ?? '', code: init.code ?? '',
  metaKey: init.metaKey ?? false, ctrlKey: init.ctrlKey ?? false,
  altKey: init.altKey ?? false, shiftKey: init.shiftKey ?? false,
});

describe('keyIdFromEvent', () => {
  it('names letters by physical key', () =>
    expect(keyIdFromEvent(ev({ key: 'c', code: 'KeyC', metaKey: true }))).toBe('Cmd+C'));

  it('names a letter the same however the layout mangles it', () =>
    expect(keyIdFromEvent(ev({ key: 'ç', code: 'KeyC', altKey: true }))).toBe('Alt+C'));

  it('names digits by physical key', () =>
    expect(keyIdFromEvent(ev({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true })))
      .toBe('Ctrl+Shift+1'));

  // D2: the = / + key had two names depending on Shift, and the "+" leaked into
  // a format that is joined and split on "+".
  it('gives the =/+ key one name', () => {
    expect(keyIdFromEvent(ev({ key: '=', code: 'Equal' }))).toBe('Equal');
    expect(keyIdFromEvent(ev({ key: '+', code: 'Equal', shiftKey: true }))).toBe('Shift+Equal');
  });

  it('orders modifiers canonically', () =>
    expect(keyIdFromEvent(ev({
      key: 'r', code: 'KeyR', shiftKey: true, altKey: true, ctrlKey: true, metaKey: true,
    }))).toBe('Cmd+Ctrl+Alt+Shift+R'));

  it('ignores bare modifiers', () =>
    expect(keyIdFromEvent(ev({ key: 'Meta', code: 'MetaLeft', metaKey: true }))).toBeNull());

  // Review Focus 3: an unknown code must leave the event alone, not be swallowed.
  it('returns null for codes outside the token table', () => {
    expect(keyIdFromEvent(ev({ key: 'Unidentified', code: 'Lang1' }))).toBeNull();
    expect(keyIdFromEvent(ev({ key: 'AudioVolumeUp', code: 'AudioVolumeUp' }))).toBeNull();
  });

  it('names the keys the panel already uses', () => {
    expect(keyIdFromEvent(ev({ key: ' ', code: 'Space' }))).toBe('Space');
    expect(keyIdFromEvent(ev({ key: 'F5', code: 'F5' }))).toBe('F5');
    expect(keyIdFromEvent(ev({ key: '/', code: 'Slash' }))).toBe('Slash');
    expect(keyIdFromEvent(ev({ key: '`', code: 'Backquote', ctrlKey: true }))).toBe('Ctrl+Backquote');
  });
});

describe('keyIdParts', () => {
  it('splits a token from its modifiers', () =>
    expect(keyIdParts('Cmd+Shift+Slash')).toEqual({ mods: ['Cmd', 'Shift'], token: 'Slash' }));
  it('rejects an unknown token', () => expect(keyIdParts('Cmd+Banana')).toBeNull());
  it('rejects a bad modifier', () => expect(keyIdParts('Hyper+A')).toBeNull());
  it('accepts a bare token', () =>
    expect(keyIdParts('F5')).toEqual({ mods: [], token: 'F5' }));
});

describe('isKeyId', () => {
  it('accepts a canonical id', () => expect(isKeyId('Cmd+Shift+Slash')).toBe(true));
  it('rejects a mis-ordered one', () => expect(isKeyId('Shift+Cmd+Slash')).toBe(false));
  it('rejects the old format', () => expect(isKeyId('Cmd+Shift+/')).toBe(false));
});
