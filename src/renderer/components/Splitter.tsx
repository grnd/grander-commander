import { useCallback, useRef } from 'react';

type Props = {
  onDrag: (pct: number) => void;
  onReset: () => void;
};

export function Splitter({ onDrag, onReset }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const move = (ev: MouseEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      onDrag(Math.max(10, Math.min(90, pct)));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [onDrag]);

  return <div ref={ref} className="gc-splitter" onMouseDown={onMouseDown} onDoubleClick={onReset} />;
}
