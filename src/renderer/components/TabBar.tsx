// src/renderer/components/TabBar.tsx
import { useState } from 'react';

type Tab = { id: string; path: string };

type Props = {
  tabs: Tab[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
  onNew: () => void;
  /**
   * A folder dropped on a tab sends *that* tab there; dropped on "+" it opens
   * a new one. `index` is null for the new-tab button.
   */
  onLocationDrop?: (index: number | null, e: React.DragEvent) => void;
};

function label(path: string): string {
  if (path === '/') return '/';
  const i = path.lastIndexOf('/');
  const tail = i >= 0 ? path.slice(i + 1) : path;
  return tail || path;
}

/**
 * Per-panel tab strip. Hidden while a side has a single tab so the chrome only
 * appears once it is carrying information; Cmd+T is the way in, and the
 * cheatsheet carries that.
 */
export function TabBar({ tabs, activeIndex, onSelect, onClose, onNew, onLocationDrop }: Props) {
  // null is the new-tab button, which is a drop target of its own.
  const [dropOver, setDropOver] = useState<number | null | 'none'>('none');

  if (tabs.length <= 1) return null;

  const dropProps = (index: number | null) => (onLocationDrop ? {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'link';
      setDropOver(index);
    },
    onDragLeave: () => setDropOver((v) => (v === index ? 'none' : v)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropOver('none');
      onLocationDrop(index, e);
    },
  } : {});

  return (
    <div className="gc-tabbar" role="tablist">
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={i === activeIndex}
          title={tab.path}
          className={
            `gc-tab${i === activeIndex ? ' is-active' : ''}${dropOver === i ? ' is-drop-target' : ''}`
          }
          onMouseDown={(e) => {
            // Middle-click closes, as in every browser.
            if (e.button === 1) { e.preventDefault(); onClose(i); return; }
            onSelect(i);
          }}
          {...dropProps(i)}
        >
          <span className="gc-tab-label">{label(tab.path)}</span>
          <button
            type="button"
            className="gc-tab-close"
            aria-label={`Close tab ${label(tab.path)}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onClose(i); }}
          >✕</button>
        </div>
      ))}
      <button
        type="button"
        className={`gc-tab-new${dropOver === null ? ' is-drop-target' : ''}`}
        aria-label="New tab"
        onClick={onNew}
        {...dropProps(null)}
      >+</button>
    </div>
  );
}
