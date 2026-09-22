import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { WinBurst } from "@/components/effects/WinBurst";

export type MomentPayload = { title: string; subtitle?: string; burst?: boolean };

const EVENT = "taj:moment";

/** يطلق بانرًا ذهبيًا فوق الشاشة لكل من يشاهد التطبيق الآن. */
export function fireMoment(payload: MomentPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<MomentPayload>(EVENT, { detail: payload }));
}

export function GoldenMomentHost() {
  const [moment, setMoment] = useState<(MomentPayload & { key: number }) | null>(null);

  useEffect(() => {
    function onMoment(e: Event) {
      const detail = (e as CustomEvent<MomentPayload>).detail;
      if (!detail?.title) return;
      setMoment({ ...detail, key: Date.now() });
    }
    window.addEventListener(EVENT, onMoment);
    return () => window.removeEventListener(EVENT, onMoment);
  }, []);

  useEffect(() => {
    if (!moment) return;
    const t = window.setTimeout(() => setMoment(null), 4200);
    return () => window.clearTimeout(t);
  }, [moment]);

  if (!moment) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex justify-center px-4">
      <WinBurst active={Boolean(moment.burst)} />
      <div
        key={moment.key}
        className="golden-moment flex max-w-md items-center gap-2 rounded-2xl px-4 py-2.5 text-center"
      >
        <Crown className="h-5 w-5 shrink-0" />
        <div className="min-w-0 text-start">
          <p className="truncate text-sm font-black">{moment.title}</p>
          {moment.subtitle && (
            <p className="truncate text-[11px] font-bold opacity-80">{moment.subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
