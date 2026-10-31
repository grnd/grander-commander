import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ShortcutsTab } from '@renderer/settings/ShortcutsTab';
import { defaultBindings } from '@shared/commands/catalog';
import type { Bindings } from '@shared/keymap/lookup';
import type { KeymapSnapshot } from '@shared/keymap/types';

const snapshot = (bindings: Bindings = defaultBindings(), revision = 1): KeymapSnapshot =>
  ({ revision, bindings, overrides: {}, diagnostics: [], readOnly: false });

const keymap = {
  get: vi.fn(), onChanged: vi.fn(() => () => {}), apply: vi.fn(), undo: vi.fn(),
  setCapture: vi.fn(), openSettings: vi.fn(),
};

beforeEach(() => {
  keymap.get.mockReset().mockResolvedValue(snapshot());
  keymap.onChanged.mockReset().mockReturnValue(() => {});
  keymap.apply.mockReset().mockResolvedValue({
    ok: true, snapshot: snapshot(defaultBindings(), 2), displaced: [], undoToken: 't1',
  });
  keymap.undo.mockReset().mockResolvedValue({
    ok: true, snapshot: snapshot(defaultBindings(), 3), displaced: [], undoToken: null,
  });
  keymap.setCapture.mockReset().mockResolvedValue({ capturing: false });
  (window as unknown as { gc: unknown }).gc = { keymap };
});

const row = (name: string) => screen.findByRole('row', { name });

describe('ShortcutsTab', () => {
  it('lists a command with its keys and its context', async () => {
    render(<ShortcutsTab />);
    const copy = await row('Copy to the other pane — Global');
    expect(copy).toHaveTextContent('F5');
    expect(copy).toHaveTextContent('⌘C');
  });

  it('gives a two-context command one row for each context', async () => {
    render(<ShortcutsTab />);
    expect(await row('Move to Trash — Global')).toHaveTextContent('F8');
    expect(await row('Move to Trash — Panel')).toHaveTextContent('⌘⌦');
  });

  it('shows the context a surface command belongs to', async () => {
    render(<ShortcutsTab />);
    expect(await row('Close the viewer — Viewer')).toHaveTextContent('⎋');
  });

  it('filters by command name', async () => {
    render(<ShortcutsTab />);
    await row('Copy to the other pane — Global');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'trash' } });
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: 'Copy to the other pane — Global' })).toBeNull());
    expect(screen.getByRole('row', { name: 'Move to Trash — Global' })).toBeInTheDocument();
  });

  it('filters by a pressed key, and clears again', async () => {
    render(<ShortcutsTab />);
    await row('Copy to the other pane — Global');
    fireEvent.click(screen.getByRole('button', { name: /find by key/i }));
    fireEvent.keyDown(document, { key: 'F8', code: 'F8' });

    await waitFor(() =>
      expect(screen.queryByRole('row', { name: 'Copy to the other pane — Global' })).toBeNull());
    expect(screen.getByRole('row', { name: 'Move to Trash — Global' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear the key filter/i }));
    await waitFor(() =>
      expect(screen.getByRole('row', { name: 'Copy to the other pane — Global' })).toBeInTheDocument());
  });

  it('removes one key through its chip', async () => {
    render(<ShortcutsTab />);
    const copy = await row('Copy to the other pane — Global');
    fireEvent.click(within(copy).getByRole('button', { name: 'Remove F5' }));
    await waitFor(() => expect(keymap.apply).toHaveBeenCalledWith({
      revision: 1, op: { kind: 'remove', context: 'global', command: 'copy', key: 'F5' },
    }));
  });

  it('resets one row', async () => {
    render(<ShortcutsTab />);
    const copy = await row('Copy to the other pane — Global');
    fireEvent.click(within(copy).getByRole('button', { name: /reset/i }));
    await waitFor(() => expect(keymap.apply).toHaveBeenCalledWith({
      revision: 1, op: { kind: 'resetCommand', context: 'global', command: 'copy' },
    }));
  });

  it('resets everything behind a confirm', async () => {
    render(<ShortcutsTab />);
    await row('Copy to the other pane — Global');
    fireEvent.click(screen.getByRole('button', { name: /reset all/i }));
    expect(keymap.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /yes, reset all/i }));
    await waitFor(() => expect(keymap.apply).toHaveBeenCalledWith({
      revision: 1, op: { kind: 'resetAll' },
    }));
  });

  it('disables the row this version cannot change, and says why', async () => {
    render(<ShortcutsTab />);
    const fixed = await row('Erase the command line, or parent folder — Panel');
    expect(within(fixed).getByRole('button', { name: /record/i })).toBeDisabled();
    expect(within(fixed).getByText(/fixed in this version/i)).toBeInTheDocument();
  });

  it('shows the reason when an edit is refused', async () => {
    keymap.apply.mockResolvedValue({
      ok: false, reason: 'external-change', message: 'keymap.json changed on disk',
      snapshot: snapshot(defaultBindings(), 5),
    });
    render(<ShortcutsTab />);
    const copy = await row('Copy to the other pane — Global');
    fireEvent.click(within(copy).getByRole('button', { name: 'Remove F5' }));
    expect(await screen.findByText(/changed on disk/)).toBeInTheDocument();
  });

  it('says so when the file is read only', async () => {
    keymap.get.mockResolvedValue({
      ...snapshot(), readOnly: true,
      diagnostics: [{ kind: 'future-version', message: 'keymap.json is version 2' }],
    });
    render(<ShortcutsTab />);
    expect(await screen.findByText(/version 2/)).toBeInTheDocument();
    const copy = await row('Copy to the other pane — Global');
    expect(within(copy).getByRole('button', { name: /record/i })).toBeDisabled();
  });

  it('records a key and assigns it to the row', async () => {
    render(<ShortcutsTab />);
    const copy = await row('Copy to the other pane — Global');
    fireEvent.click(within(copy).getByRole('button', { name: /record/i }));
    fireEvent.keyDown(document, { key: 'F12', code: 'F12' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(keymap.apply).toHaveBeenCalledWith({
      revision: 1, op: { kind: 'assign', context: 'global', command: 'copy', key: 'F12' },
    }));
  });

  it('reports a take-over and undoes it', async () => {
    keymap.apply.mockResolvedValue({
      ok: true, snapshot: snapshot(defaultBindings(), 2),
      displaced: [{ context: 'global', command: 'copy', key: 'F5' }], undoToken: 'tok',
    });
    render(<ShortcutsTab />);
    const rename = await row('Rename — Global');
    fireEvent.click(within(rename).getByRole('button', { name: /record/i }));
    fireEvent.keyDown(document, { key: 'F5', code: 'F5' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Took F5 from Copy to the other pane/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(keymap.undo).toHaveBeenCalledWith({ revision: 2, token: 'tok' }));
  });

  it('closes the recorder on Cancel', async () => {
    render(<ShortcutsTab />);
    const copy = await row('Copy to the other pane — Global');
    fireEvent.click(within(copy).getByRole('button', { name: /record/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: /record a shortcut/i })).toBeNull());
    expect(keymap.apply).not.toHaveBeenCalled();
  });
});
