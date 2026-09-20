import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Loader2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRefreshMoney, useSupabaseSession, useWallet } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { formatCompact, formatFull } from "@/lib/format";
import { wheelArt } from "@/lib/wheel-art";

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

type SlotTotal = { total: number; players: number };

type WheelState = {
  round: WheelRound | null;
  session?: { id: string; date: string; round: number; max_rounds: number; status: string } | null;
  slot_totals?: Record<string, SlotTotal>;
  mine?: Record<string, number>;
  my_payout?: number;
};

type DailyTopRow = {
  user_id: string;
  public_id: string;
  display_name: string;
  avatar_url: string | null;
  total_bet: number;
  gross_win: number;
  net_result: number;
  rank: number;
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

const BET_STEPS = [10_000_000, 50_000_000, 100_000_000, 200_000_000];

/** تسمية مختصرة للمستويات الكبيرة */
function betLabel(n: number) {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${n / 1_000}K`;
  return String(n);
}

export function LiveWheel({ roomId = null }: { roomId?: string | null }) {
  const { userId } = useSupabaseSession();
  const wallet = useWallet(userId);
  const refreshMoney = useRefreshMoney();
  const [amount, setAmount] = useState(10_000_000);
  const [now, setNow] = useState(() => Date.now());
  const [highlight, setHighlight] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const lastSettled = useRef<string | null>(null);

  // استعلام واحد مجمّع من السيرفر: الجولة + إجماليات كل فاكهة + رهاني.
  // لا تُنقل آلاف الرهانات إلى الهاتف، فلا تهنيج مهما كان عدد المراهنين.
  const state = useQuery({
    queryKey: ["wheel-state"],
    refetchInterval: 1800,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("wheel_round_state");
      if (!error) return data as WheelState | null;
      const last = await db
        .from("wheel_rounds")
        .select("id, session_round_no, round_no, status, slots, winning_key, ends_at, settled_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last.error) throw new Error(error.message);
      if (!last.data) return null;
      return { round: { ...last.data, round_no: last.data.session_round_no ?? last.data.round_no } } as WheelState;
    },
  });

  const round = useMemo(
    () => ({
      data: state.data?.round ?? null,
      isLoading: state.isLoading,
      isError: state.isError,
      error: state.error,
    }),
    [state.data, state.isLoading, state.isError, state.error],
  );
  const roundId = round.data?.id ?? null;
  const slotTotals = state.data?.slot_totals ?? {};
  const mineTotals = state.data?.mine ?? {};
  const session = state.data?.session ?? null;

  // أفضل 10 لاعبين اليوم — صافي النتيجة الحقيقي من قاعدة البيانات
  const dailyTop = useQuery({
    queryKey: ["wheel-daily-top"],
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("wheel_daily_top", { _limit: 10 });
      if (error) throw new Error(error.message);
      return (data ?? []) as DailyTopRow[];
    },
  });

  const history = useQuery({
    queryKey: ["wheel-history"],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await db
        .from("wheel_rounds")
        .select("id, round_no, status, winning_key, slots, started_at, ends_at, settled_at")
        .eq("status", "finished")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw new Error(error.message);
      return (data ?? []) as WheelRound[];
    },
  });

  // أرباح اليوم وصافي نتيجتي: من ترتيب اليوم المحسوب على السيرفر
  const myToday = (dailyTop.data ?? []).find((row) => row.user_id === userId) ?? null;
  const todayWin = Number(myToday?.gross_win ?? 0);

  const resultRound = round.data?.status === "finished" ? round.data : history.data?.[0] ?? null;
  const resultRoundId = resultRound?.id ?? null;
  // أعلى الرهانات الفائزة فقط (٢٠ صفًا كحد أقصى) بدل تحميل رهانات الجولة كلها
  const resultBets = useQuery({
    queryKey: ["wheel-result-bets", resultRoundId],
    enabled: Boolean(resultRoundId),
    refetchInterval: resultRoundId === roundId ? 1800 : false,
    queryFn: async () => {
      const { data, error } = await db
        .from("wheel_bets")
        .select("id, round_id, user_id, slot_key, amount, payout")
        .eq("round_id", resultRoundId)
        .gt("payout", 0)
        .order("payout", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as WheelBet[];
    },
  });

  const myResult = useQuery({
    queryKey: ["wheel-my-result", resultRoundId, userId],
    enabled: Boolean(resultRoundId && userId),
    refetchInterval: resultRoundId === roundId ? 1800 : false,
    queryFn: async () => {
      const { data, error } = await db
        .from("wheel_bets")
        .select("amount, payout")
        .eq("round_id", resultRoundId)
        .eq("user_id", userId)
        .limit(200);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { amount: number; payout: number }[];
      return {
        bet: rows.reduce((s, r) => s + Number(r.amount), 0),
        win: rows.reduce((s, r) => s + Number(r.payout), 0),
      };
    },
  });

  const resultPlayers = useQuery({
    queryKey: ["wheel-result-players", resultRoundId, resultBets.data?.length ?? 0],
    enabled: Boolean(resultBets.data?.length),
    queryFn: async () => {
      const ids = Array.from(new Set((resultBets.data ?? []).map((bet) => bet.user_id)));
      const { data, error } = await db.from("profiles").select("id, display_name, avatar_url").in("id", ids);
      if (error) throw new Error(error.message);
      return new Map(
        ((data ?? []) as { id: string; display_name: string; avatar_url: string | null }[]).map((profile) => [profile.id, profile]),
      );
    },
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const slots = round.data?.slots ?? [];
  const roundRef = useRef<WheelRound | null>(null);
  roundRef.current = round.data ?? null;
  const finished = round.data?.status === "finished";
  const remaining = round.data ? Math.max(0, Math.ceil((new Date(round.data.ends_at).getTime() - now) / 1000)) : 0;

  // عند تسوية الجولة: المؤشر يلف على كل الفواكه ٤ ثوانٍ ثم يتوقف على الفائزة
  const roundKey = `${round.data?.id ?? ""}:${round.data?.status ?? ""}:${round.data?.winning_key ?? ""}`;
  const afterSpin = useRef<() => void>(() => {});
  afterSpin.current = () => {
    refreshMoney();
    void history.refetch();
  };
  useEffect(() => {
    const [id, status, key] = roundKey.split(":");
    const data = roundRef.current;
    if (!id || status !== "finished" || !key || !data) return;
    if (lastSettled.current === id) return;
    lastSettled.current = id;
    // نتيجة قديمة (فُتحت الصفحة بعد انتهاء الجولة): تُعرض بدون تعطيل المراهنة
    const settledAgo = Date.now() - new Date(data.settled_at ?? data.ends_at).getTime();
    const target = Math.max(0, data.slots.findIndex((s) => s.key === key));
    if (settledAgo > 15_000) {
      setHighlight(target);
      return;
    }
    const count = Math.max(1, data.slots.length);
    const steps = count * 3 + 1;
    const weights = Array.from({ length: steps }, (_, i) => 1 + Math.pow(i / Math.max(1, steps - 1), 2.6) * 9);
    const sum = weights.reduce((a, b) => a + b, 0);
    const delays = weights.map((w) => (w / sum) * 4000);
    setSpinning(true);
    let step = 0;
    let timer = 0;
    const tick = () => {
      setHighlight((h) => (h + 1) % count);
      step += 1;
      if (step < steps) {
        timer = window.setTimeout(tick, delays[step] ?? 120);
      } else {
        setHighlight(target);
        setSpinning(false);
        afterSpin.current();
      }
    };
    timer = window.setTimeout(tick, delays[0] ?? 120);
    // أمان: لا تترك اللعبة عالقة في وضع "جاري السحب" أبدًا
    const guard = window.setTimeout(() => setSpinning(false), 6000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(guard);
    };
  }, [roundKey]);

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
      void state.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تسجيل الرهان"),
  });

  // الإجماليات تأتي مجمّعة من السيرفر — لا عنصر واجهة لكل رهان
  const perSlot = useMemo(() => {
    const map = new Map<string, { total: number; mine: number; players: number }>();
    for (const s of slots) {
      const agg = slotTotals[s.key];
      map.set(s.key, {
        total: Number(agg?.total ?? 0),
        players: Number(agg?.players ?? 0),
        mine: Number(mineTotals[s.key] ?? 0),
      });
    }
    return map;
  }, [slots, slotTotals, mineTotals]);

  const myBet = useMemo(
    () => Object.values(mineTotals).reduce((sum, v) => sum + Number(v), 0),
    [mineTotals],
  );

  const resultLeaderboard = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of resultBets.data ?? []) {
      if (Number(b.payout) <= 0) continue;
      map.set(b.user_id, (map.get(b.user_id) ?? 0) + Number(b.payout));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [resultBets.data]);

  const resultMyWin = Number(myResult.data?.win ?? 0);
  const resultMyBet = Number(myResult.data?.bet ?? 0);

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
  const resultWinning = resultRound?.slots.find((slot) => slot.key === resultRound.winning_key);

  return (
    <div className="space-y-2">
      {/* لوح العجلة — نفس تخطيط الصور المرجعية */}
      <div className="wheel-board relative overflow-hidden rounded-3xl p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="wheel-cabin-cap rounded-full px-3 py-1 text-[11px] font-extrabold">
            جولة {round.data?.round_no ?? "-"}
            {session ? ` / ${session.max_rounds}` : ""}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-extrabold",
              spinning ? "wheel-bar" : finished ? "wheel-cabin-mine border" : "wheel-chip border",
            )}
          >
            {spinning ? "جاري إعلان النتيجة" : finished ? "الجولة مغلقة" : `مفتوحة ${remaining}ث`}
          </span>
          <span className="wheel-chip flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-extrabold">
            <Trophy className="h-3.5 w-3.5" />
            {(wallet.data?.coins ?? 0).toLocaleString("en-US")}
          </span>
        </div>

        {/* هيكل العجلة: أسلاك + كبائن الفواكه حولها + قلب العدّاد */}
        <div className="relative mx-auto mt-3 aspect-square w-full max-w-[360px] sm:max-w-[460px]">
          {/* الإطار والأسلاك */}
          <div className="wheel-ring absolute inset-[20%] rounded-full border-[12px]" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`spoke-${i}`}
              className="wheel-spoke absolute left-1/2 top-1/2 h-[30%] w-[6px] -translate-x-1/2 origin-top rounded-full"
              style={{ transform: `rotate(${i * 45}deg)` }}
            />
          ))}

          {/* كبائن الفواكه */}
          {slots.map((s, i) => {
            const step = (2 * Math.PI) / Math.max(1, slots.length);
            const a = -Math.PI / 2 + step * i;
            const r = 39;
            const left = 50 + r * Math.cos(a);
            const top = 50 + r * Math.sin(a);
            const stat = perSlot.get(s.key) ?? { total: 0, mine: 0, players: 0 };
            const active = spinning && highlight === i;
            const isWinner = finished && !spinning && round.data?.winning_key === s.key;
            const heat = stat.total >= 200_000_000 ? 3 : stat.total >= 50_000_000 ? 2 : stat.total > 0 ? 1 : 0;
            return (
              <button
                key={s.key}
                type="button"
                disabled={finished || spinning || place.isPending}
                onClick={() => place.mutate(s.key)}
                style={{ left: `${left}%`, top: `${top}%` }}
                className={cn(
                  "wheel-cabin absolute w-[30%] max-w-[8.5rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border-[3px] text-center shadow-[0_6px_14px_-4px_rgba(0,0,0,0.45)] transition-all disabled:opacity-95",
                  isWinner
                    ? "wheel-cabin-winner scale-110 z-20"
                    : active
                      ? "wheel-cabin-active z-20 scale-105"
                      : stat.mine > 0
                        ? "wheel-cabin-mine"
                        : "",
                )}
              >
                {/* رأس الكبينة: صورة الطبق + المضاعف */}
                <span className="flex items-center justify-between gap-1 bg-white px-1.5 py-1">
                  <SlotIcon slotKey={s.key} emoji={s.emoji} size={24} />
                  <span className="wheel-mult text-[13px] font-black italic leading-none">x{s.multiplier}</span>
                </span>
                {/* رهاني */}
                <span className="wheel-cabin-body block px-1 py-[3px] text-[10px] font-extrabold leading-tight">
                  أنت {stat.mine > 0 ? formatCompact(stat.mine) : ""}
                </span>
                {/* حرارة الرهان الكلي */}
                <span className="flex min-h-[14px] items-center justify-center gap-0.5 bg-white px-1 pb-0.5 text-[9px] font-bold text-stone-500">
                  {heat > 0 ? (
                    <>
                      {Array.from({ length: heat }).map((_, f) => (
                        <span key={f} className="emoji text-[10px] leading-none">🔥</span>
                      ))}
                      <span className="ms-0.5">{formatCompact(stat.total)}</span>
                    </>
                  ) : null}
                </span>
              </button>
            );
          })}

          {/* قلب العجلة: مدة الاختيار / الفاكهة الفائزة */}
          <div className="wheel-hub absolute inset-[35%] flex flex-col items-center justify-center rounded-full border-[6px] text-center">
            <span className="text-[10px] font-bold">
              {spinning ? "جاري السحب" : finished ? "الفائزة" : "مُدة الاختيار"}
            </span>
            <span className={cn("text-4xl font-black leading-none", spinning && "animate-pulse")}>
              {spinning ? (
                <span className="emoji">🎡</span>
              ) : finished && winning ? (
                <SlotIcon slotKey={winning.key} emoji={winning.emoji} size={46} />
              ) : finished ? (
                <span className="emoji">🎡</span>
              ) : (
                remaining
              )}
            </span>
            {finished && !spinning && winning && <span className="text-[10px] font-bold">x{winning.multiplier}</span>}
          </div>
        </div>

        {/* قاعدة العجلة مثل الصورة */}
        <div className="relative mx-auto -mt-1 h-3 w-[72%] rounded-full bg-[oklch(0.7_0.13_240)] shadow-[0_4px_10px_-4px_rgba(0,0,0,0.5)]" />

        {/* شرائح الرهان مثل الصور */}
        <div className="mt-3 flex items-center justify-center gap-2">
          {BET_STEPS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAmount(n)}
              className={cn(
                "wheel-chip flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl border-[3px] text-xs font-black transition-all",
                amount === n && "wheel-chip-active scale-105 shadow-[0_0_16px_-2px_oklch(0.78_0.17_75/0.9)]",
              )}
            >
              <Coins className="h-4 w-4" />
              {betLabel(n)}
            </button>
          ))}
        </div>

        {/* شريط الرصيد وأرباح اليوم */}
        <div className="wheel-bar mt-2 flex items-center gap-2 rounded-2xl px-2 py-2">
          <div className="flex flex-1 items-center justify-between rounded-xl bg-background/25 px-2.5 py-1.5">
            <span className="text-[10px]">أرباح اليوم</span>
            <span className="text-xs font-extrabold" title={formatFull(todayWin ?? 0)}>
              {formatCompact(todayWin ?? 0)}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-between rounded-xl bg-background/25 px-2.5 py-1.5">
            <span className="text-[10px]">رهانك</span>
            <span className="text-xs font-extrabold" title={formatFull(myBet)}>
              {formatCompact(myBet)}
            </span>
          </div>
        </div>

        {/* شريط نتائج الجولات السابقة */}
        <div className="wheel-bar mt-2 flex items-center gap-2 overflow-x-auto rounded-2xl px-3 py-2">
          <span className="shrink-0 text-[10px] font-extrabold">النتيجة</span>
          {(history.data ?? []).map((r) => {
            const slot = (r.slots ?? []).find((x) => x.key === r.winning_key);
            return (
              <span
                key={r.id}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/25 text-sm"
                title={`الجولة ${r.round_no}`}
              >
                {slot ? <SlotIcon slotKey={slot.key} emoji={slot.emoji} size={20} /> : "؟"}
              </span>
            );
          })}
          {(history.data?.length ?? 0) === 0 && <span className="text-[10px] opacity-80">لا جولات سابقة</span>}
        </div>

        {/* لافتة الفوز الكبير */}
        {resultRound && !spinning && resultMyWin > 0 && (
          <div className="mt-2 animate-scale-in rounded-2xl gradient-gold px-4 py-3 text-center text-primary-foreground shadow-[0_0_30px_-8px_oklch(0.82_0.16_85/0.85)]">
            <p className="text-xl font-extrabold tracking-[0.2em]">BIG WIN</p>
            <p className="text-sm font-bold">+{resultMyWin.toLocaleString("en-US")} كوينز</p>
          </div>
        )}
      </div>

      {/* نتيجة سحب الجولة وترتيب الأرباح */}
      {resultRound && !spinning && (
        <div className="surface-card animate-scale-in p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold">نتيجة سحب الجولة {resultRound.round_no}</span>
            <span className="flex items-center gap-1 font-bold text-primary">
              {resultWinning?.label}
              {resultWinning && <SlotIcon slotKey={resultWinning.key} emoji={resultWinning.emoji} size={20} />}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-surface-2 py-2">
              <p className="text-[10px] text-muted-foreground">رهانك هذه الجولة</p>
              <p className="text-sm font-bold">{resultMyBet.toLocaleString("en-US")}</p>
            </div>
            <div className="rounded-2xl bg-surface-2 py-2">
              <p className="text-[10px] text-muted-foreground">أرباح هذه الجولة</p>
              <p className="text-sm font-bold text-success">{resultMyWin.toLocaleString("en-US")}</p>
            </div>
          </div>

          <p className="mb-2 mt-3 text-center text-[11px] font-bold text-primary">
            — — — أفضل 3 فائزين في الجولة — — —
          </p>
          {resultLeaderboard.length > 0 ? (
            <>
              <div className="flex items-end justify-center gap-2">
                {[1, 0, 2].map((idx) => {
                  const entry = resultLeaderboard[idx];
                  if (!entry) return null;
                  const [uid, total] = entry;
                  const pl = resultPlayers.data?.get(uid);
                  const first = idx === 0;
                  const rankColor =
                    idx === 0 ? "border-primary" : idx === 1 ? "border-muted-foreground" : "border-warning";
                  return (
                    <div
                      key={uid}
                      className={cn(
                        "flex flex-col items-center rounded-2xl bg-surface-2 px-2 py-2",
                        first ? "w-[38%] -translate-y-2" : "w-[30%]",
                      )}
                    >
                      <div className="relative">
                        {pl?.avatar_url ? (
                          <img
                            src={pl.avatar_url}
                            alt={pl.display_name}
                            loading="lazy"
                            className={cn(
                              "rounded-xl border-[3px] object-cover",
                              rankColor,
                              first ? "h-16 w-16" : "h-12 w-12",
                            )}
                          />
                        ) : (
                          <span
                            className={cn(
                              "block rounded-xl border-[3px] bg-surface-3",
                              rankColor,
                              first ? "h-16 w-16" : "h-12 w-12",
                            )}
                          />
                        )}
                        <span
                          className={cn(
                            "absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full border border-background text-[10px] font-extrabold text-primary-foreground",
                            idx === 0 ? "gradient-gold" : "bg-surface-3 text-foreground",
                          )}
                        >
                          {idx + 1}
                        </span>
                      </div>
                      <span className="mt-1.5 w-full truncate text-center text-[11px] font-bold">
                        {pl?.display_name ?? "لاعب"}
                      </span>
                      <span className="text-[11px] font-extrabold text-primary">
                        {total.toLocaleString("en-US")} 🪙
                      </span>
                    </div>
                  );
                })}
              </div>
              {resultLeaderboard.length > 3 && (
                <div className="mt-2 space-y-1">
                  {resultLeaderboard.slice(3).map(([uid, total], i) => {
                    const pl = resultPlayers.data?.get(uid);
                    return (
                      <div key={uid} className="flex items-center gap-2 text-xs">
                        <span className="w-4 font-bold text-muted-foreground">{i + 4}</span>
                        <span className="min-w-0 flex-1 truncate">{pl?.display_name ?? "لاعب"}</span>
                        <span className="font-bold text-success">+{total.toLocaleString("en-US")}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl bg-surface-2 px-3 py-4 text-center text-xs text-muted-foreground">
              لم يفز أي مشارك في هذه الجولة.
            </div>
          )}
        </div>
      )}
      {/* 🏆 كأس اليوم — أفضل ١٠ حسب صافي النتيجة */}
      <div className="surface-card p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-extrabold text-primary">🏆 كأس اليوم — أفضل 10</p>
          <span className="text-[10px] text-muted-foreground">صافي النتيجة = الأرباح − الرهانات</span>
        </div>
        {(dailyTop.data ?? []).length === 0 ? (
          <p className="mt-3 rounded-2xl bg-surface-2 py-3 text-center text-[11px] text-muted-foreground">
            لا نتائج اليوم بعد — أول رهان يفتح الترتيب.
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            {(dailyTop.data ?? []).map((row) => (
              <div
                key={row.user_id}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-2 py-1.5 text-[11px]",
                  row.user_id === userId ? "bg-primary/10" : "bg-surface-2",
                )}
              >
                <span className="w-5 text-center font-extrabold text-primary">
                  {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
                </span>
                {row.avatar_url ? (
                  <img
                    src={row.avatar_url}
                    alt={row.display_name}
                    loading="lazy"
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-lg object-cover"
                  />
                ) : (
                  <span className="h-7 w-7 rounded-lg bg-surface-3" />
                )}
                <span className="min-w-0 flex-1 truncate font-bold">{row.display_name}</span>
                <span className="text-[10px] text-muted-foreground">#{row.public_id}</span>
                <span className="text-[10px] text-muted-foreground" title="الأرباح الإجمالية">
                  {formatCompact(row.gross_win)}
                </span>
                <span
                  className={cn("font-extrabold", Number(row.net_result) >= 0 ? "text-success" : "text-destructive")}
                  title={`${formatFull(row.net_result)} كوينز`}
                >
                  {Number(row.net_result) >= 0 ? "+" : "−"}
                  {formatCompact(Math.abs(Number(row.net_result)))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SlotIcon({ slotKey, emoji, size }: { slotKey: string; emoji?: string; size: number }) {
  const src = wheelArt(slotKey);
  if (!src) return <span className="emoji" style={{ fontSize: size }}>{emoji ?? "؟"}</span>;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      width={size}
      height={size}
      className="shrink-0 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
      style={{ width: size, height: size }}
    />
  );
}
