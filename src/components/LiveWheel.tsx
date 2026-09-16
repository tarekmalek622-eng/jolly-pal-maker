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
  const [spinAngle, setSpinAngle] = useState(0);
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

  // spin the wheel to the winning slot once the server settles the round
  useEffect(() => {
    const data = round.data;
    if (!data || data.status !== "finished" || !data.winning_key) return;
    if (lastSettled.current === data.id) return;
    lastSettled.current = data.id;
    const index = data.slots.findIndex((s) => s.key === data.winning_key);
    const per = 360 / Math.max(1, data.slots.length);
    setSpinAngle((prev) => prev + 1440 + ((360 - index * per) % 360));
    refreshMoney();
    void history.refetch();
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
    <div className="space-y-3">
      <div className="surface-card relative overflow-hidden p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-primary">الجولة {round.data?.round_no ?? "-"}</span>
          <span className={cn("font-bold", finished ? "text-success" : "text-foreground")}>
            {finished ? "النتيجة" : `${remaining} ثانية`}
          </span>
        </div>

        {/* الفواكه داخل الدائرة مع مؤشر يلف عليها ويتوقف على الفائزة */}
        <div className="relative mx-auto mt-4 aspect-square w-full max-w-[320px]">
          <div className="absolute inset-0 rounded-full border-[6px] border-primary/35 bg-[radial-gradient(circle_at_center,oklch(0.26_0.05_275),oklch(0.16_0.03_275))] shadow-[0_0_40px_-12px_oklch(0.72_0.16_85/0.55)]" />
          {slots.map((s, i) => {
            const step = (2 * Math.PI) / Math.max(1, slots.length);
            const a = -Math.PI / 2 + step * i;
            const r = 38;
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
                  "absolute flex h-[19%] w-[19%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 transition-all disabled:opacity-70",
                  isWinner
                    ? "scale-110 border-success bg-success/25 shadow-[0_0_22px_oklch(0.72_0.17_150/0.7)]"
                    : active
                      ? "scale-110 border-primary bg-primary/25 shadow-[0_0_20px_oklch(0.82_0.16_85/0.6)]"
                      : stat.mine > 0
                        ? "border-primary/70 bg-primary/10"
                        : "border-border/70 bg-surface-2/80",
                )}
              >
                <span className="text-xl leading-none">{s.emoji}</span>
                <span className="mt-0.5 text-[9px] font-extrabold text-primary">×{s.multiplier}</span>
                {stat.total > 0 && (
                  <span className="text-[8px] text-muted-foreground">{stat.total.toLocaleString("en-US")}</span>
                )}
              </button>
            );
          })}
          <div className="absolute inset-[30%] flex flex-col items-center justify-center rounded-full gradient-gold text-primary-foreground">
            <span className="text-[10px] font-bold">{finished ? "الفائزة" : "الوقت"}</span>
            <span className="text-2xl font-extrabold">{finished ? (winning?.emoji ?? "🎡") : remaining}</span>
            {finished && winning && <span className="text-[10px] font-bold">×{winning.multiplier}</span>}
          </div>
        </div>

        {/* لافتة الفوز الكبير */}
        {finished && myWin > 0 && (
          <div className="mt-3 animate-scale-in rounded-2xl gradient-gold px-4 py-3 text-center text-primary-foreground shadow-[0_0_30px_-8px_oklch(0.82_0.16_85/0.8)]">
            <p className="text-lg font-extrabold tracking-widest">BIG WIN</p>
            <p className="text-sm font-bold">+{myWin.toLocaleString("en-US")} كوينز</p>
          </div>
        )}

        {finished && winning && myWin === 0 && (
          <p className="mt-3 animate-fade-in text-center text-sm font-bold text-success">
            🎉 {winning.label} ×{winning.multiplier}
          </p>
        )}
      </div>

      <div className="surface-card p-3">
        <p className="text-xs font-bold">قيمة الرهان</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {BET_STEPS.map((n) => (
            <button
              key={n}
              onClick={() => setAmount(n)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs",
                amount === n ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              {n.toLocaleString("en-US")}
            </button>
          ))}
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
            className="h-9 w-24 rounded-full bg-surface-2 text-center text-xs"
          />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          رصيدك: {(wallet.data?.coins ?? 0).toLocaleString("en-US")} كوينز
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {slots.map((s) => {
          const stat = perSlot.get(s.key) ?? { total: 0, mine: 0, players: 0 };
          const isWinner = finished && round.data?.winning_key === s.key;
          return (
            <button
              key={s.key}
              disabled={finished || place.isPending}
              onClick={() => place.mutate(s.key)}
              className={cn(
                "rounded-2xl border p-3 text-start transition-colors disabled:opacity-60",
                isWinner
                  ? "border-success bg-success/15"
                  : stat.mine > 0
                    ? "border-primary bg-primary/10"
                    : "border-border bg-surface-2",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">{s.emoji}</span>
                <span className="text-xs font-extrabold text-primary">×{s.multiplier}</span>
              </div>
              <p className="mt-1 text-[11px] font-bold">{s.label}</p>
              <p className="text-[10px] text-muted-foreground">
                الإجمالي {stat.total.toLocaleString("en-US")} · {stat.players} لاعب
              </p>
              {stat.mine > 0 && (
                <p className="text-[10px] font-bold text-primary">أنت {stat.mine.toLocaleString("en-US")}</p>
              )}
            </button>
          );
        })}
      </div>

      {finished && leaderboard.length > 0 && (
        <div className="surface-card animate-scale-in p-3">
          <p className="mb-2 flex items-center gap-1 text-xs font-bold">
            <Trophy className="h-4 w-4 text-primary" /> ترتيب أرباح الجولة
          </p>
          <div className="space-y-1.5">
            {leaderboard.map(([uid, total], i) => {
              const p = players.data?.get(uid);
              return (
                <div key={uid} className="flex items-center gap-2 text-xs">
                  <span className="w-4 font-bold text-primary">{i + 1}</span>
                  {p?.avatar_url ? (
                    <img src={p.avatar_url} alt={p.display_name} loading="lazy" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span className="h-6 w-6 rounded-full bg-surface-2" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{p?.display_name ?? "لاعب"}</span>
                  <span className="font-bold text-success">+{total.toLocaleString("en-US")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="surface-card p-3">
        <p className="mb-2 text-xs font-bold">سجل الجولات</p>
        <div className="flex flex-wrap gap-1.5">
          {(history.data ?? []).map((r) => {
            const slot = (r.slots ?? []).find((s) => s.key === r.winning_key);
            return (
              <span key={r.id} className="rounded-lg bg-surface-2 px-2 py-1 text-[11px]">
                {slot?.emoji ?? "؟"} <span className="text-muted-foreground">#{r.round_no}</span>
              </span>
            );
          })}
          {(history.data?.length ?? 0) === 0 && <span className="text-[11px] text-muted-foreground">لا جولات سابقة</span>}
        </div>
      </div>
    </div>
  );
}
