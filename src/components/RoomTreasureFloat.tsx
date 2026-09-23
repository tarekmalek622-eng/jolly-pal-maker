import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GiftRain } from "@/components/effects/GiftRain";
import { formatCompact } from "@/lib/format";

type FloatState = {
  level: number;
  progress: number;
  current: { name?: string; target?: number };
};

/**
 * صندوق الكنز كأيقونة عائمة داخل الغرفة يراها جميع الحاضرين،
 * تعرض المستوى ونسبة التقدّم الحقيقية من قاعدة البيانات.
 */
export function RoomTreasureFloat({ roomId, onOpen }: { roomId: string; onOpen: () => void }) {
  const state = useQuery({
    queryKey: ["room-treasure-float", roomId],
    refetchInterval: 20000,
    staleTime: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("room_treasure_state", { _room_id: roomId });
      if (error) throw new Error(error.message);
      return data as unknown as FloatState;
    },
  });

  const level = state.data?.level ?? 1;
  const target = Number(state.data?.current?.target ?? 0);
  const progress = Number(state.data?.progress ?? 0);
  const pct = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0;

  /* مطر هدايا لجميع الحاضرين عند وصول الكنز لهدفه */
  const [rain, setRain] = useState(false);
  const firedLevel = useRef<number | null>(null);
  useEffect(() => {
    if (pct < 100 || firedLevel.current === level) return;
    firedLevel.current = level;
    setRain(true);
    const timer = window.setTimeout(() => setRain(false), 4200);
    return () => window.clearTimeout(timer);
  }, [pct, level]);

  return (
    <>
      <GiftRain active={rain} />
      <button
      type="button"
      onClick={onOpen}
      aria-label="صندوق كنز الغرفة"
      className="pointer-events-auto flex w-16 flex-col items-center gap-1"
    >
      <span className="relative grid h-14 w-14 place-items-center rounded-2xl border border-primary/50 bg-gradient-to-b from-amber-500/30 to-black/50 text-2xl shadow-[0_0_18px_rgba(255,190,60,0.35)] backdrop-blur">
        🎁
        <span className="absolute -top-1.5 right-0 rounded-full bg-primary px-1.5 text-[9px] font-black text-primary-foreground">
          Lv{level}
        </span>
      </span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-black/50">
        <span className="block h-full rounded-full gradient-gold" style={{ width: `${pct}%` }} />
      </span>
      <span className="rounded-full bg-black/55 px-1.5 text-[9px] font-bold text-amber-200">
        {target > 0 ? `${formatCompact(progress)}/${formatCompact(target)}` : "الكنز"}
      </span>
    </button>
  );
}
