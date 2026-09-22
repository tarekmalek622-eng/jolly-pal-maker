import { useEffect, useMemo, useRef, useState } from "react";

/** مطر ألماس عند الفوز. */
export function WinBurst({ active, count = 26 }: { active: boolean; count?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 2600);
    return () => window.clearTimeout(t);
  }, [active]);

  const drops = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 96,
        delay: Math.random() * 0.8,
        duration: 1.5 + Math.random() * 1.1,
        size: 12 + Math.round(Math.random() * 12),
      })),
    [count, visible],
  );

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      {drops.map((d) => (
        <span
          key={d.id}
          className="diamond-drop absolute top-0 select-none"
          style={{
            left: `${d.left}%`,
            fontSize: `${d.size}px`,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
          }}
        >
          💎
        </span>
      ))}
    </div>
  );
}

/** عدّاد يتحرك تدريجيًا نحو الرقم الجديد. */
export function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) frame = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  useEffect(() => {
    fromRef.current = display;
  }, [display]);

  return display;
}
