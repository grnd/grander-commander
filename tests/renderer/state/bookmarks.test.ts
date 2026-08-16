import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, BOOKMARK_COUNT } from '@renderer/state/store';

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ bookmarks: Array.from({ length: BOOKMARK_COUNT }, () => null) });
});

describe('bookmark slots', () => {
  it('starts with nine empty slots', () => {
    expect(useStore.getState().bookmarks).toHaveLength(9);
    expect(useStore.getState().bookmarks.every((b) => b === null)).toBe(true);
  });

  it('stores a path in a 1-based slot', () => {
    useStore.getState().setBookmark(3, '/Users/me/src');
    expect(useStore.getState().bookmarks[2]).toBe('/Users/me/src');
    expect(useStore.getState().bookmarks[0]).toBeNull();
  });

  it('overwrites an occupied slot', () => {
    useStore.getState().setBookmark(1, '/a');
    useStore.getState().setBookmark(1, '/b');
    expect(useStore.getState().bookmarks[0]).toBe('/b');
  });

  it('clears a slot with null', () => {
    useStore.getState().setBookmark(1, '/a');
    useStore.getState().setBookmark(1, null);
    expect(useStore.getState().bookmarks[0]).toBeNull();
  });

  it('ignores out-of-range slots', () => {
    useStore.getState().setBookmark(0, '/a');
    useStore.getState().setBookmark(10, '/a');
    expect(useStore.getState().bookmarks.every((b) => b === null)).toBe(true);
  });

  it('persists to localStorage so slots survive a restart', () => {
    useStore.getState().setBookmark(2, '/Users/me/docs');
    const raw = localStorage.getItem('gc.bookmarks');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)[1]).toBe('/Users/me/docs');
  });
});
