import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '@renderer/components/TabBar';

const tabs = [
  { id: 'a', path: '/Users/me/src' },
  { id: 'b', path: '/Users/me/docs' },
];

function setup(list = tabs, activeIndex = 0) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const onNew = vi.fn();
  const view = render(
    <TabBar tabs={list} activeIndex={activeIndex} onSelect={onSelect} onClose={onClose} onNew={onNew} />,
  );
  return { onSelect, onClose, onNew, ...view };
}

describe('TabBar', () => {
  it('stays out of the way while a side has one tab', () => {
    const { container } = setup([tabs[0]]);
    expect(container).toBeEmptyDOMElement();
  });

  it('labels tabs by folder name and marks the active one', () => {
    setup();
    const rendered = screen.getAllByRole('tab');
    expect(rendered[0]).toHaveTextContent('src');
    expect(rendered[0]).toHaveAttribute('aria-selected', 'true');
    expect(rendered[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('keeps the full path in the tooltip', () => {
    setup();
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('title', '/Users/me/docs');
  });

  it('labels the root sensibly', () => {
    setup([{ id: 'a', path: '/' }, tabs[1]]);
    expect(screen.getAllByRole('tab')[0]).toHaveTextContent('/');
  });

  it('selects a tab on click', () => {
    const { onSelect } = setup();
    fireEvent.mouseDown(screen.getAllByRole('tab')[1]);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('closes on the close button without also selecting', () => {
    const { onClose, onSelect } = setup();
    fireEvent.click(screen.getByLabelText('Close tab docs'));
    expect(onClose).toHaveBeenCalledWith(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on middle-click, as browsers do', () => {
    const { onClose, onSelect } = setup();
    fireEvent.mouseDown(screen.getAllByRole('tab')[1], { button: 1 });
    expect(onClose).toHaveBeenCalledWith(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens a new tab from the + button', () => {
    const { onNew } = setup();
    fireEvent.click(screen.getByLabelText('New tab'));
    expect(onNew).toHaveBeenCalled();
  });
});
