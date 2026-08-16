// src/renderer/components/TabBar.tsx
type Tab = { id: string; path: string };

type Props = {
  tabs: Tab[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
  onNew: () => void;
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
export function TabBar({ tabs, activeIndex, onSelect, onClose, onNew }: Props) {
  if (tabs.length <= 1) return null;

  return (
    <div className="gc-tabbar" role="tablist">
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={i === activeIndex}
          title={tab.path}
          className={`gc-tab${i === activeIndex ? ' is-active' : ''}`}
          onMouseDown={(e) => {
            // Middle-click closes, as in every browser.
            if (e.button === 1) { e.preventDefault(); onClose(i); return; }
            onSelect(i);
          }}
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
      <button type="button" className="gc-tab-new" aria-label="New tab" onClick={onNew}>+</button>
    </div>
  );
}
