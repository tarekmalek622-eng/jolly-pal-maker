import { useEffect, useState } from "react";

/** مطر هدايا يغطي الشاشة عند تحقيق هدف الغرفة. */
export function GiftRain({ active, count = 24 }: { active: boolean; count?: number }) {
  const [items, setItems] = useState<{ left: number; delay: number; dur: number; size: number }[]>(
    [],
  );

  useEffect(() => {
    if (!active) {
      setItems([]);
      return;
    }
    setItems(
      Array.from({ length: count }, () => ({
        left: Math.random() * 96,
        delay: Math.random() * 1.2,
        dur: 2.2 + Math.random() * 1.6,
        size: 18 + Math.random() * 16,
      })),
    );
    const timer = window.setTimeout(() => setItems([]), 4200);
    return () => window.clearTimeout(timer);
  }, [active, count]);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[85] overflow-hidden">
      {items.map((item, index) => (
        <span
          key={index}
          className="diamond-drop absolute top-0"
          style={{
            left: `${item.left}%`,
            fontSize: `${item.size}px`,
            animationDelay: `${item.delay}s`,
            animationDuration: `${item.dur}s`,
          }}
        >
          🎁
        </span>
      ))}
    </div>
  );
}
