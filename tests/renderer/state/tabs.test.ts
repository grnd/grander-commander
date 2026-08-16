import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '@renderer/state/store';
import { initialPanelState } from '@renderer/state/panelSlice';

const reset = (path = '/home') => {
  const left = { ...initialPanelState(path), width: 40 };
  const right = initialPanelState('/other');
  useStore.setState({
    panels: { left, right },
    tabs: { left: [left], right: [right] },
    activeTab: { left: 0, right: 0 },
    activeSide: 'left',
  });
};

const s = () => useStore.getState();
const leftPaths = () => s().tabs.left.map((t) => t.path);

beforeEach(() => reset());

describe('tabs', () => {
  it('starts with one tab per side', () => {
    expect(s().tabs.left).toHaveLength(1);
    expect(s().tabs.right).toHaveLength(1);
    expect(s().activeTab).toEqual({ left: 0, right: 0 });
  });

  it('opens a new tab beside the current one and focuses it', () => {
    s().newTab('left');
    expect(s().tabs.left).toHaveLength(2);
    expect(s().activeTab.left).toBe(1);
    expect(s().panels.left).toBe(s().tabs.left[1]);
  });

  it('gives the new tab the same folder and view settings', () => {
    useStore.setState({ panels: { ...s().panels, left: { ...s().panels.left, showHidden: true } } });
    s().newTab('left');
    expect(s().panels.left.path).toBe('/home');
    expect(s().panels.left.showHidden).toBe(true);
  });

  it('gives every tab a distinct id for keying', () => {
    s().newTab('left');
    s().newTab('left');
    const ids = s().tabs.left.map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('leaves the other side alone', () => {
    s().newTab('left');
    expect(s().tabs.right).toHaveLength(1);
  });

  it('commits the live view before switching away', () => {
    useStore.setState({ panels: { ...s().panels, left: { ...s().panels.left, path: '/moved' } } });
    s().newTab('left');
    expect(leftPaths()[0]).toBe('/moved');
  });

  it('restores a tab exactly as it was left', () => {
    s().newTab('left');
    useStore.setState({ panels: { ...s().panels, left: { ...s().panels.left, path: '/second', cursor: 7 } } });
    s().selectTab('left', 0);
    expect(s().panels.left.path).toBe('/home');
    s().selectTab('left', 1);
    expect(s().panels.left.path).toBe('/second');
    expect(s().panels.left.cursor).toBe(7);
  });

  // The splitter belongs to the side, not to whichever tab was showing when it
  // was dragged.
  it('keeps the panel width across a tab switch', () => {
    s().newTab('left');
    useStore.setState({ panels: { ...s().panels, left: { ...s().panels.left, width: 70 } } });
    s().selectTab('left', 0);
    expect(s().panels.left.width).toBe(70);
  });

  it('ignores a select of the active or an out-of-range tab', () => {
    const before = s().panels.left;
    s().selectTab('left', 0);
    s().selectTab('left', 5);
    s().selectTab('left', -1);
    expect(s().panels.left).toBe(before);
  });

  it('refuses to close the last tab', () => {
    s().closeTab('left', 0);
    expect(s().tabs.left).toHaveLength(1);
  });

  it('closes a tab and activates its neighbour', () => {
    s().newTab('left');
    useStore.setState({ panels: { ...s().panels, left: { ...s().panels.left, path: '/second' } } });
    s().closeTab('left', 1);
    expect(s().tabs.left).toHaveLength(1);
    expect(s().panels.left.path).toBe('/home');
  });

  it('shifts the active index when an earlier tab closes', () => {
    s().newTab('left');   // index 1
    s().newTab('left');   // index 2, active
    expect(s().activeTab.left).toBe(2);
    s().closeTab('left', 0);
    expect(s().activeTab.left).toBe(1);
    expect(s().tabs.left).toHaveLength(2);
  });

  it('keeps the active tab pointed at a real tab when the last one closes', () => {
    s().newTab('left');
    s().closeTab('left', 1);
    expect(s().activeTab.left).toBe(0);
    expect(s().panels.left).toEqual(expect.objectContaining({ path: '/home' }));
  });

  it('ignores an out-of-range close', () => {
    s().newTab('left');
    s().closeTab('left', 9);
    expect(s().tabs.left).toHaveLength(2);
  });
});
