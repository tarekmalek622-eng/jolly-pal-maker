import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRefreshMoney, useSupabaseSession, useWallet } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export type WheelSlot = { key: string; label: string; emoji: string; multiplier: number; weight?: number };

type WheelRound = {
  id: string;
  round_no: number;
  status: string;
  slots: WheelSlot[];
  winning_key: string | null;
  ends_at: string;
  settled_at: string | null;
};

type WheelBet = {
  id: string;
  round_id: string;
  user_id: string;
  slot_key: string;
  amount: number;
  payout: number;
};

// generated types lag behind the new wheel tables/RPCs
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
};

const BET_STEPS = [100, 500, 2000, 10000];

export function LiveWheel({ roomId = null }: { roomId?: string | null }) {
  const { userId } = useSupabaseSession();
  const wallet = useWallet(userId);
  const refreshMoney = useRefreshMoney();
  const [amount, setAmount] = useState(100);
  const [now, setNow] = useState(() => Date.now());
  const [highlight, setHighlight] = useState(0);
  const lastSettled = useRef<string | null>(null);

  const round = useQuery({
    queryKey: ["wheel-round"],
    refetchInterval: 1800,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("wheel_tick");
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as WheelRound | null;
      return row;
    },
  });

  const roundId = round.data?.id ?? null;

  const bets = useQuery({
    queryKey: ["wheel-bets", roundId],
    enabled: Boolean(roundId),
    refetchInterval: 1800,
    queryFn: async () => {
      const { data, error } = await db
        .from("wheel_bets")
        .select("id, round_id, user_id, slot_key, amount, payout")
        .eq("round_id", roundId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as WheelBet[];
    },
  });

  const players = useQuery({
    queryKey: ["wheel-players", roundId, bets.data?.length ?? 0],
    enabled: Boolean(bets.data?.length),
    queryFn: async () => {
      const ids = Array.from(new Set((bets.data ?? []).map((b) => b.user_id)));
      const { data, error } = await db
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      if (error) throw new Error(error.message);
      return new Map(
        ((data ?? []) as { id: string; display_name: string; avatar_url: string | null }[]).map((p) => [p.id, p]),
      );
    },
  });

  const history = useQuery({
    queryKey: ["wheel-history"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await db
        .from("wheel_rounds")
        .select("id, round_no, winning_key, slots, settled_at")
        .eq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw new Error(error.message);
      return (data ?? []) as WheelRound[];
    },
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const slots = round.data?.slots ?? [];
  const finished = round.data?.status === "finished";
  const remaining = round.data ? Math.max(0, Math.ceil((new Date(round.data.ends_at).getTime() - now) / 1000)) : 0;

  // مؤشر يلف على الفواكه أثناء المراهنة
  useEffect(() => {
    if (finished || slots.length === 0) return;
    const t = window.setInterval(() => setHighlight((h) => (h + 1) % slots.length), 420);
    return () => window.clearInterval(t);
  }, [finished, slots.length]);

  // عند تسوية الجولة من السيرفر: يتباطأ المؤشر ثم يتوقف على الفائزة
  useEffect(() => {
    const data = round.data;
    if (!data || data.status !== "finished" || !data.winning_key) return;
    if (lastSettled.current === data.id) return;
    lastSettled.current = data.id;
    const target = data.slots.findIndex((s) => s.key === data.winning_key);
    const count = Math.max(1, data.slots.length);
    let step = 0;
    const total = count * 2 + ((target - highlight + count) % count);
    let timer = 0;
    const tick = () => {
      step += 1;
      setHighlight((h) => (h + 1) % count);
      if (step < total) {
        timer = window.setTimeout(tick, 90 + step * 12);
      } else {
        setHighlight(target < 0 ? 0 : target);
      }
    };
    timer = window.setTimeout(tick, 90);
    refreshMoney();
    void history.refetch();
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.data, refreshMoney, history]);

  const place = useMutation({
    mutationFn: async (slotKey: string) => {
      const { error } = await db.rpc("wheel_bet", {
        _slot_key: slotKey,
        _amount: amount,
        _room_id: roomId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refreshMoney();
      void bets.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تسجيل الرهان"),
  });

  const perSlot = useMemo(() => {
    const map = new Map<string, { total: number; mine: number; players: number }>();
    for (const s of slots) map.set(s.key, { total: 0, mine: 0, players: 0 });
    for (const b of bets.data ?? []) {
      const e = map.get(b.slot_key) ?? { total: 0, mine: 0, players: 0 };
      e.total += Number(b.amount);
      if (b.user_id === userId) e.mine += Number(b.amount);
      e.players += 1;
      map.set(b.slot_key, e);
    }
    return map;
  }, [slots, bets.data, userId]);

  const myWin = useMemo(
    () => (bets.data ?? []).filter((b) => b.user_id === userId).reduce((sum, b) => sum + Number(b.payout), 0),
    [bets.data, userId],
  );

  const leaderboard = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of bets.data ?? []) {
      if (Number(b.payout) <= 0) continue;
      map.set(b.user_id, (map.get(b.user_id) ?? 0) + Number(b.payout));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [bets.data]);

  if (round.isLoading) {
    return (
      <div className="surface-card flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (round.isError) {
    return (
      <div className="surface-card p-5 text-center text-xs text-muted-foreground">
        {round.error instanceof Error ? round.error.message : "تعذر تحميل العجلة"}
      </div>
    );
  }

  const winning = slots.find((s) => s.key === round.data?.winning_key);

  return (
    <div className="space-y-2">
      {/* لوح العجلة — نفس تخطيط الصور المرجعية */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-[radial-gradient(circle_at_50%_35%,oklch(0.32_0.06_90),oklch(0.18_0.03_275))] p-3">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-background/40 px-3 py-1 text-[11px] font-bold text-primary">
            اليوم الجولة {round.data?.round_no ?? "-"}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="flex h-8 items-center gap-1 rounded-full bg-background/40 px-2.5 text-[11px] font-bold">
              <Trophy className="h-3.5 w-3.5 text-primary" />
              {(wallet.data?.coins ?? 0).toLocaleString("en-US")}
            </span>
          </div>
        </div>

        {/* هيكل العجلة: أسلاك + خانات الفواكه حولها + قلب العدّاد */}
        <div className="relative mx-auto mt-3 aspect-square w-full max-w-[340px]">
          {/* الإطار والأسلاك */}
          <div className="absolute inset-[14%] rounded-full border-[10px] border-sky-400/70 bg-sky-500/10" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`spoke-${i}`}
              className="absolute left-1/2 top-1/2 h-[36%] w-[5px] -translate-x-1/2 origin-top rounded-full bg-sky-400/60"
              style={{ transform: `rotate(${i * 45}deg)` }}
            />
          ))}

          {/* خانات الفواكه */}
          {slots.map((s, i) => {
            const step = (2 * Math.PI) / Math.max(1, slots.length);
            const a = -Math.PI / 2 + step * i;
            const r = 41;
            const left = 50 + r * Math.cos(a);
            const top = 50 + r * Math.sin(a);
            const stat = perSlot.get(s.key) ?? { total: 0, mine: 0, players: 0 };
            const active = highlight === i;
            const isWinner = finished && round.data?.winning_key === s.key;
            return (
              <button
                key={s.key}
                type="button"
                disabled={finished || place.isPending}
                onClick={() => place.mutate(s.key)}
                style={{ left: `${left}%`, top: `${top}%` }}
                className={cn(
                  "absolute w-[30%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border-2 text-center shadow-lg transition-all disabled:opacity-80",
                  isWinner
                    ? "scale-110 border-success bg-success/25 shadow-[0_0_22px_oklch(0.72_0.17_150/0.75)]"
                    : active
                      ? "scale-105 border-primary bg-primary/25 shadow-[0_0_18px_oklch(0.82_0.16_85/0.6)]"
                      : stat.mine > 0
                        ? "border-primary/70 bg-primary/10"
                        : "border-sky-400/60 bg-background/60",
                )}
              >
                <span className="flex items-center justify-between gap-1 bg-background/70 px-1.5 py-1">
                  <span className="text-base leading-none">{s.emoji}</span>
                  <span className="text-[10px] font-extrabold text-primary">×{s.multiplier}</span>
                </span>
                <span className="block px-1 py-1 text-[9px] leading-tight">
                  <span className="block text-muted-foreground">أنت {stat.mine.toLocaleString("en-US")}</span>
                  <span className="block font-bold text-primary">{stat.total.toLocaleString("en-US")}</span>
                </span>
              </button>
            );
          })}

          {/* قلب العجلة: مدة الاختيار / الفاكهة الفائزة */}
          <div className="absolute inset-[33%] flex flex-col items-center justify-center rounded-full border-[5px] border-primary/60 bg-[radial-gradient(circle,oklch(0.42_0.16_20),oklch(0.28_0.12_20))] text-center text-primary-foreground">
            <span className="text-[10px] font-bold">{finished ? "الفائزة" : "مُدة الاختيار"}</span>
            <span className="text-3xl font-extrabold leading-none">
              {finished ? (winning?.emoji ?? "🎡") : remaining}
            </span>
            {finished && winning && <span className="text-[10px] font-bold">×{winning.multiplier}</span>}
          </div>
        </div>

        {/* شرائح الرهان مثل الصور */}
        <div className="mt-3 flex items-center justify-center gap-2">
          {BET_STEPS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAmount(n)}
              className={cn(
                "flex h-12 w-[22%] flex-col items-center justify-center rounded-2xl border-2 text-[11px] font-extrabold transition-all",
                amount === n
                  ? "scale-105 border-primary bg-primary/25 text-primary"
                  : "border-sky-400/50 bg-background/60 text-muted-foreground",
              )}
            >
              <Coins className="h-3.5 w-3.5 text-primary" />
              {n >= 1000 ? `${n / 1000}K` : n}
            </button>
          ))}
        </div>

        {/* شريط الرصيد وأرباح اليوم */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 items-center justify-between rounded-2xl bg-background/60 px-3 py-2">
            <span className="text-[10px] text-muted-foreground">أرباح اليوم</span>
            <span className="text-xs font-extrabold text-success">
              {(todayWin ?? 0).toLocaleString("en-US")}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-between rounded-2xl bg-background/60 px-3 py-2">
            <span className="text-[10px] text-muted-foreground">رصيدك</span>
            <span className="text-xs font-extrabold text-primary">
              {(wallet.data?.coins ?? 0).toLocaleString("en-US")}
            </span>
          </div>
        </div>

        {/* شريط نتائج الجولات السابقة */}
        <div className="mt-2 flex items-center gap-2 overflow-x-auto rounded-2xl bg-background/60 px-3 py-2">
          <span className="shrink-0 text-[10px] font-bold text-muted-foreground">النتيجة</span>
          {(history.data ?? []).map((r) => {
            const slot = (r.slots ?? []).find((x) => x.key === r.winning_key);
            return (
              <span
                key={r.id}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-surface-2 text-sm"
                title={`الجولة ${r.round_no}`}
              >
                {slot?.emoji ?? "؟"}
              </span>
            );
          })}
          {(history.data?.length ?? 0) === 0 && (
            <span className="text-[10px] text-muted-foreground">لا جولات سابقة</span>
          )}
        </div>

        {/* لافتة الفوز الكبير */}
        {finished && myWin > 0 && (
          <div className="mt-2 animate-scale-in rounded-2xl gradient-gold px-4 py-3 text-center text-primary-foreground shadow-[0_0_30px_-8px_oklch(0.82_0.16_85/0.85)]">
            <p className="text-xl font-extrabold tracking-[0.2em]">BIG WIN</p>
            <p className="text-sm font-bold">+{myWin.toLocaleString("en-US")} كوينز</p>
          </div>
        )}
      </div>

      {/* نتيجة سحب الجولة وترتيب الأرباح */}
      {finished && (
        <div className="surface-card animate-scale-in p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold">نتيجة سحب الجولة {round.data?.round_no}</span>
            <span className="font-bold text-primary">
              {winning?.label} {winning?.emoji}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-surface-2 py-2">
              <p className="text-[10px] text-muted-foreground">رهانك هذه الجولة</p>
              <p className="text-sm font-bold">{myBet.toLocaleString("en-US")}</p>
            </div>
            <div className="rounded-2xl bg-surface-2 py-2">
              <p className="text-[10px] text-muted-foreground">أرباحك هذه الجولة</p>
              <p className="text-sm font-bold text-success">{myWin.toLocaleString("en-US")}</p>
            </div>
          </div>

          {leaderboard.length > 0 && (
            <>
              <p className="mb-2 mt-3 flex items-center gap-1 text-xs font-bold">
                <Trophy className="h-4 w-4 text-primary" /> الترتيب من أرباح هذه الجولة
              </p>
              <div className="space-y-1.5">
                {leaderboard.map(([uid, total], i) => {
                  const pl = players.data?.get(uid);
                  return (
                    <div key={uid} className="flex items-center gap-2 text-xs">
                      <span className="w-4 font-bold text-primary">{i + 1}</span>
                      {pl?.avatar_url ? (
                        <img src={pl.avatar_url} alt={pl.display_name} loading="lazy" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <span className="h-7 w-7 rounded-full bg-surface-2" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{pl?.display_name ?? "لاعب"}</span>
                      <span className="font-bold text-success">+{total.toLocaleString("en-US")}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
