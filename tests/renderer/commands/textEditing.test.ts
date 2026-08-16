import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyTextEditing } from '@renderer/commands/textEditing';

function field(value: string, start = 0, end = value.length) {
  const el = document.createElement('input');
  el.value = value;
  document.body.appendChild(el);
  el.setSelectionRange(start, end);
  return el;
}

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('applyTextEditing', () => {
  it('selects the whole field on Cmd+A', () => {
    const el = field('hello world', 3, 3);
    expect(applyTextEditing('Cmd+A', el)).toBe(true);
    expect(el.selectionStart).toBe(0);
    expect(el.selectionEnd).toBe(11);
  });

  it('copies the selected text', () => {
    const el = field('hello world', 6, 11);
    expect(applyTextEditing('Cmd+C', el)).toBe(true);
    expect(writeText).toHaveBeenCalledWith('world');
  });

  it('cuts the selection out of the field', () => {
    const el = field('hello world', 5, 11);
    expect(applyTextEditing('Cmd+X', el)).toBe(true);
    expect(writeText).toHaveBeenCalledWith(' world');
    expect(el.value).toBe('hello');
    expect(el.selectionStart).toBe(5);
  });

  it('fires an input event so a controlled field notices the cut', () => {
    const el = field('hello world', 5, 11);
    const seen = vi.fn();
    el.addEventListener('input', seen);
    applyTextEditing('Cmd+X', el);
    expect(seen).toHaveBeenCalled();
  });

  // Otherwise Cmd+C with no selection would fall through and copy files.
  it('still consumes Cmd+C when nothing is selected', () => {
    const el = field('hello', 2, 2);
    expect(applyTextEditing('Cmd+C', el)).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('leaves paste to the Edit menu', () => {
    expect(applyTextEditing('Cmd+V', field('x'))).toBe(false);
  });

  it('ignores combinations that are not text editing', () => {
    const el = field('hello');
    expect(applyTextEditing('F5', el)).toBe(false);
    expect(applyTextEditing('Cmd+R', el)).toBe(false);
    expect(applyTextEditing('Enter', el)).toBe(false);
  });

  it('works on a textarea too', () => {
    const el = document.createElement('textarea');
    el.value = 'multi line';
    document.body.appendChild(el);
    el.setSelectionRange(0, 5);
    expect(applyTextEditing('Cmd+X', el)).toBe(true);
    expect(el.value).toBe(' line');
  });
});
