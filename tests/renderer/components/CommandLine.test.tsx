import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandLine } from '@renderer/components/CommandLine';
import type { Completion } from '@shared/types';

function setup(items: Completion[] = []) {
  const onRun = vi.fn();
  const onCursorUp = vi.fn();
  const onCursorDown = vi.fn();
  const complete = vi.fn(async () => items);
  render(
    <CommandLine
      cwd="/Users/me/proj"
      label="~/proj"
      onRun={onRun}
      onCursorUp={onCursorUp}
      onCursorDown={onCursorDown}
      complete={complete}
    />,
  );
  const input = screen.getByRole('textbox') as HTMLInputElement;
  const type = (text: string) => {
    fireEvent.change(input, { target: { value: text } });
    input.setSelectionRange(text.length, text.length);
  };
  return { input, type, onRun, onCursorUp, onCursorDown, complete };
}

const tab = (input: HTMLInputElement, shiftKey = false) =>
  fireEvent.keyDown(input, { key: 'Tab', shiftKey });

describe('CommandLine', () => {
  it('shows the label, not the raw cwd', () => {
    setup();
    expect(screen.getByText(/~\/proj/)).toBeInTheDocument();
  });

  it('runs the trimmed command on Enter and clears the line', () => {
    const { input, type, onRun } = setup();
    type('  ls -la  ');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRun).toHaveBeenCalledWith('ls -la');
    expect(input.value).toBe('');
  });

  it('does not run an empty line', () => {
    const { input, onRun } = setup();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRun).not.toHaveBeenCalled();
  });

  it('asks for command completions on the first word', async () => {
    const { input, type, complete } = setup([{ value: 'echo', kind: 'exec' }]);
    type('ec');
    tab(input);
    await waitFor(() => expect(complete).toHaveBeenCalledWith('ec', '/Users/me/proj', 'command'));
  });

  it('asks for path completions on later words', async () => {
    const { input, type, complete } = setup([{ value: 'src', kind: 'dir' }]);
    type('cat sr');
    tab(input);
    await waitFor(() => expect(complete).toHaveBeenCalledWith('sr', '/Users/me/proj', 'path'));
  });

  it('inserts a unique completion and terminates it', async () => {
    const { input, type } = setup([{ value: 'components', kind: 'dir' }]);
    type('cd com');
    tab(input);
    await waitFor(() => expect(input.value).toBe('cd components/'));
    expect(screen.queryByTestId('gc-completions')).not.toBeInTheDocument();
  });

  it('extends to the common prefix and lists the candidates when ambiguous', async () => {
    const { input, type } = setup([
      { value: 'commands', kind: 'dir' },
      { value: 'common.ts', kind: 'file' },
    ]);
    type('cd co');
    tab(input);
    await waitFor(() => expect(input.value).toBe('cd comm'));
    expect(screen.getByTestId('gc-completions')).toBeInTheDocument();
    expect(screen.getByText('commands')).toBeInTheDocument();
  });

  it('cycles candidates on repeated Tab without re-querying', async () => {
    const { input, type, complete } = setup([
      { value: 'commands', kind: 'dir' },
      { value: 'common.ts', kind: 'file' },
    ]);
    type('cd co');
    tab(input);
    await waitFor(() => expect(input.value).toBe('cd comm'));

    tab(input);
    await waitFor(() => expect(input.value).toBe('cd commands'));
    tab(input);
    await waitFor(() => expect(input.value).toBe('cd common.ts'));
    tab(input);
    await waitFor(() => expect(input.value).toBe('cd commands'));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('cycles backwards on Shift+Tab', async () => {
    const { input, type } = setup([
      { value: 'commands', kind: 'dir' },
      { value: 'common.ts', kind: 'file' },
    ]);
    type('cd co');
    tab(input);
    await waitFor(() => expect(input.value).toBe('cd comm'));
    tab(input, true);
    await waitFor(() => expect(input.value).toBe('cd common.ts'));
  });

  it('leaves the line alone when nothing matches', async () => {
    const { input, type } = setup([]);
    type('cd zzz');
    tab(input);
    await waitFor(() => expect(input.value).toBe('cd zzz'));
    expect(screen.queryByTestId('gc-completions')).not.toBeInTheDocument();
  });

  it('escapes a completion containing a space', async () => {
    const { input, type } = setup([{ value: 'my file.txt', kind: 'file' }]);
    type('cat my');
    tab(input);
    await waitFor(() => expect(input.value).toBe('cat my\\ file.txt '));
  });

  it('closes the suggestion list on Escape without clearing the line', async () => {
    const { input, type } = setup([
      { value: 'commands', kind: 'dir' },
      { value: 'common.ts', kind: 'file' },
    ]);
    type('cd co');
    tab(input);
    await screen.findByTestId('gc-completions');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('gc-completions')).not.toBeInTheDocument();
    expect(input.value).toBe('cd comm');
  });

  it('drops the suggestion list as soon as the user types', async () => {
    const { input, type } = setup([
      { value: 'commands', kind: 'dir' },
      { value: 'common.ts', kind: 'file' },
    ]);
    type('cd co');
    tab(input);
    await screen.findByTestId('gc-completions');

    type('cd cox');
    expect(screen.queryByTestId('gc-completions')).not.toBeInTheDocument();
  });

  it('still hands ArrowUp/ArrowDown back to the panel cursor', () => {
    const { input, onCursorUp, onCursorDown } = setup();
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(onCursorUp).toHaveBeenCalled();
    expect(onCursorDown).toHaveBeenCalled();
  });
});
