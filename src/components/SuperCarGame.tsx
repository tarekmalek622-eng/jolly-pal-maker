import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Timer, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRefreshMoney, useSupabaseSession, useWallet } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { formatCompact, formatFull } from "@/lib/format";
import { carArt } from "@/lib/car-art";
import { UserAvatar } from "@/components/UserAvatar";

type CarSlot = { key: string; label: string; multiplier: number; weight?: number; bettable?: boolean };

type CarRound = {
  id: string;
  round_no: number;
  status: string;
  slots: CarSlot[];
  winning_key: string | null;
  ends_at: string;
  settled_at: string | null;
  total_amount: number;
  total_payout: number;
};

type SlotTotal = { total: number; players: number };

type TopRow = { display_name: string; avatar_url: string | null; public_id: string; payout: number };

type CarState = {
  round: CarRound | null;
  session?: { id: string; date: string; round: number; max_rounds: number; status: string } | null;
  slot_totals?: Record<string, SlotTotal>;
  mine?: Record<string, number>;
  my_payout?: number;
  history?: (string | null)[];
  top?: TopRow[];
};

type DailyRow = {
  user_id: string;
  public_id: string;
  display_name: string;
  avatar_url: string | null;
  total_bet: number;
  gross_win: number;
  net_result: number;
  rank: number;
};

// الأنواع المولّدة لا تعرف جداول سباق السيارات الجديدة بعد
const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
};

const CHIPS = [10_000, 100_000, 1_000_000, 10_000_000, 50_000_000, 100_000_000, 200_000_000];

/** ماكينة سباق السيارات — جولات ونتائج من السيرفر بالكامل */
export function SuperCarGame({ roomId = null }: { roomId?: string | null }) {
  const { userId } = useSupabaseSession();
  const wallet = useWallet(userId);
  const refreshMoney = useRefreshMoney();
  const [chip, setChip] = useState(10_000_000);
  const [now, setNow] = useState(() => Date.now());

  const state = useQuery({
    queryKey: ["supercar-state"],
    refetchInterval: 1800,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("supercar_round_state");
      if (error) throw new Error(error.message);
      return data as CarState | null;
    },
  });

  const daily = useQuery({
    queryKey: ["supercar-daily-top"],
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("supercar_daily_top", { _limit: 10 });
      if (error) throw new Error(error.message);
      return (data ?? []) as DailyRow[];
    },
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const round = state.data?.round ?? null;
  const session = state.data?.session ?? null;
  const totals = state.data?.slot_totals ?? {};
  const mine = state.data?.mine ?? {};
  const myPayout = state.data?.my_payout ?? 0;
  const history = state.data?.history ?? [];
  const winners = state.data?.top ?? [];

  const slots = useMemo(() => (round?.slots ?? []).filter((s) => s.bettable !== false), [round?.slots]);
  const secondsLeft = round ? Math.max(0, Math.ceil((new Date(round.ends_at).getTime() - now) / 1000)) : 0;
  const betting = round?.status === "betting" && secondsLeft > 0;
  const revealed = !!round?.winning_key;
  const winningSlot = round?.slots?.find((s) => s.key === round.winning_key) ?? null;

  const bet = useMutation({
    mutationFn: async (slotKey: string) => {
      const { data, error } = await db.rpc("supercar_bet", {
        _slot_key: slotKey,
        _amount: chip,
        _room_id: roomId,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void state.refetch();
      refreshMoney();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const myTotal = Object.values(mine).reduce((a, b) => a + Number(b ?? 0), 0);

  return (
    <div className="space-y-3">
      {/* شريط أعلى: الجولة والمؤقّت والرصيد */}
      <div className="flex items-center justify-between rounded-2xl border border-amber-500/40 bg-gradient-to-l from-amber-950/70 to-stone-950/80 px-3 py-2">
        <div className="flex items-center gap-2 text-amber-200">
          <Trophy className="h-4 w-4" />
          <span className="text-sm font-bold">
            الجولة {round?.round_no ?? 0}
            {session ? ` / ${session.max_rounds}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-amber-300">
          <Timer className="h-3.5 w-3.5" />
          <span className="text-sm font-bold tabular-nums">{betting ? `${secondsLeft}s` : "النتيجة"}</span>
        </div>
        <span className="text-xs text-amber-100/80" title={formatFull(wallet.data?.coins ?? 0)}>
          {formatCompact(wallet.data?.coins ?? 0)}
        </span>
      </div>

      {/* حلبة الرهان — شبكة السيارات */}
      <div className="relative overflow-hidden rounded-[2rem] border-4 border-amber-600/70 bg-gradient-to-b from-emerald-900 via-emerald-800 to-emerald-950 p-3 shadow-[0_0_40px_-10px_rgba(245,158,11,0.5)]">
        <div className="grid grid-cols-4 gap-2">
          {slots.map((slot) => {
            const t = totals[slot.key];
            const my = Number(mine[slot.key] ?? 0);
            const isWinner = revealed && round?.winning_key === slot.key;
            const art = carArt(slot.key);
            return (
              <button
                key={slot.key}
                type="button"
                disabled={!betting || bet.isPending}
                onClick={() => bet.mutate(slot.key)}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition",
                  isWinner
                    ? "border-amber-300 bg-amber-400/25 shadow-[0_0_24px_rgba(252,211,77,0.8)]"
                    : "border-emerald-300/30 bg-emerald-950/40",
                  betting ? "active:scale-95" : "opacity-80",
                )}
              >
                {art ? (
                  <img src={art} alt={slot.label} loading="lazy" width={64} height={64} className="h-10 w-10 object-contain drop-shadow" />
                ) : (
                  <span className="text-2xl">🏎️</span>
                )}
                <span className="text-[11px] font-bold text-amber-200">X{slot.multiplier}</span>
                {my > 0 && (
                  <span className="absolute -top-2 -left-1 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
                    {formatCompact(my)}
                  </span>
                )}
                {t && t.total > 0 && (
                  <span className="text-[9px] text-emerald-200/80">
                    {formatCompact(t.total)} · {t.players}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* لوحة النتيجة */}
        {revealed && (
          <div className="mt-3 rounded-2xl border-2 border-amber-400/70 bg-gradient-to-b from-rose-950/90 to-stone-950/90 p-3 text-center">
            <p className="text-xs text-amber-200">نتيجة الجولة {round?.round_no}</p>
            <div className="mt-1 flex items-center justify-center gap-2">
              {carArt(round?.winning_key) && (
                <img
                  src={carArt(round?.winning_key) as string}
                  alt={winningSlot?.label ?? ""}
                  loading="lazy"
                  width={80}
                  height={80}
                  className="h-14 w-14 object-contain drop-shadow-[0_0_14px_rgba(252,211,77,0.9)]"
                />
              )}
              <div>
                <p className="font-bold text-amber-100">{winningSlot?.label ?? round?.winning_key}</p>
                <p className="text-sm font-extrabold text-amber-300">X{winningSlot?.multiplier ?? 0}</p>
              </div>
            </div>
            <p className={cn("mt-1 text-sm font-bold", myPayout > 0 ? "text-emerald-300" : "text-stone-300")}>
              {myPayout > 0 ? `ربحت ${formatCompact(myPayout)} كوينز 🎉` : myTotal > 0 ? "لم تربح هذه الجولة" : "لم تراهن في هذه الجولة"}
            </p>
            {winners.length > 0 && (
              <div className="mt-2 flex items-center justify-center gap-3">
                {winners.map((w) => (
                  <div key={w.public_id} className="flex flex-col items-center">
                    <UserAvatar src={w.avatar_url} name={w.display_name} className="h-9 w-9" />
                    <span className="max-w-16 truncate text-[10px] text-amber-100">{w.display_name}</span>
                    <span className="text-[10px] font-bold text-amber-300">{formatCompact(w.payout)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* شرائح الرهان */}
      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChip(c)}
            className={cn(
              "h-10 w-14 rounded-full border-2 text-xs font-bold transition",
              chip === c
                ? "border-amber-300 bg-amber-500/30 text-amber-100 shadow-[0_0_14px_rgba(252,211,77,0.6)]"
                : "border-stone-600 bg-stone-900/60 text-stone-300",
            )}
          >
            {formatCompact(c)}
          </button>
        ))}
        {bet.isPending && <Loader2 className="h-4 w-4 animate-spin text-amber-300" />}
      </div>

      {/* شريط النتائج السابقة */}
      {history.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-stone-700 bg-stone-950/70 p-2">
          {history.map((key, i) => {
            const art = carArt(key);
            return art ? (
              <img key={`${key}-${i}`} src={art} alt="" loading="lazy" width={40} height={40} className="h-7 w-7 shrink-0 object-contain" />
            ) : (
              <span key={`none-${i}`} className="shrink-0 text-xs text-stone-500">—</span>
            );
          })}
        </div>
      )}

      {/* كأس اليوم */}
      <div className="rounded-2xl border border-amber-600/40 bg-stone-950/70 p-3">
        <p className="mb-2 text-sm font-bold text-amber-200">🏆 كأس اليوم — أفضل 10</p>
        {daily.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
        ) : (daily.data ?? []).length === 0 ? (
          <p className="text-xs text-stone-400">لا نتائج اليوم بعد — كن أول الفائزين.</p>
        ) : (
          <ul className="space-y-1">
            {(daily.data ?? []).map((row) => (
              <li key={row.user_id} className="flex items-center gap-2 text-xs">
                <span className="w-5 text-center text-amber-300">
                  {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
                </span>
                <UserAvatar src={row.avatar_url} name={row.display_name} className="h-6 w-6" />
                <span className="flex-1 truncate text-stone-200">{row.display_name}</span>
                <span className="text-stone-500">#{row.public_id}</span>
                <span
                  className={cn("font-bold", row.net_result >= 0 ? "text-emerald-300" : "text-rose-400")}
                  title={formatFull(row.net_result)}
                >
                  {row.net_result >= 0 ? "+" : ""}
                  {formatCompact(row.net_result)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
