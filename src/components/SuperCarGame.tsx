import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlarmClock, Loader2, Trophy, Users } from "lucide-react";
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

/** شرائح الرهان بتصميم عملات الصور */
const CHIPS: { value: number; ring: string; face: string }[] = [
  { value: 100, ring: "border-sky-200", face: "bg-gradient-to-b from-sky-400 to-blue-700" },
  { value: 1_000, ring: "border-emerald-200", face: "bg-gradient-to-b from-emerald-400 to-green-700" },
  { value: 10_000, ring: "border-amber-200/70", face: "bg-gradient-to-b from-amber-800 to-stone-900" },
  { value: 100_000, ring: "border-orange-200", face: "bg-gradient-to-b from-orange-400 to-amber-700" },
  { value: 1_000_000, ring: "border-rose-200", face: "bg-gradient-to-b from-rose-500 to-red-800" },
  { value: 10_000_000, ring: "border-fuchsia-200", face: "bg-gradient-to-b from-fuchsia-500 to-purple-800" },
  { value: 100_000_000, ring: "border-yellow-200", face: "bg-gradient-to-b from-yellow-400 to-amber-600" },
];

/** كومة عملات صغيرة تمثّل مبلغ الرهان كما في التصميم */
function chipStack(amount: number): { value: number; face: string; ring: string }[] {
  const out: { value: number; face: string; ring: string }[] = [];
  let rest = amount;
  for (const c of [...CHIPS].reverse()) {
    while (rest >= c.value && out.length < 4) {
      out.push(c);
      rest -= c.value;
    }
    if (out.length >= 4) break;
  }
  return out;
}

/** ترتيب الخانات داخل الدائرة كما في التصميم: صفّان في كل سطر */
const GRID_ORDER = ["arrow", "wing", "suv", "flags", "crown", "horse", "diamond", "shield", "lion", "bolt"];

/** مواقع الشعارات حول الحلبة */
const RING = [
  { key: "arrow", top: "4%", left: "50%" },
  { key: "wing", top: "12%", left: "24%" },
  { key: "suv", top: "12%", left: "76%" },
  { key: "flags", top: "34%", left: "8%" },
  { key: "crown", top: "34%", left: "92%" },
  { key: "horse", top: "62%", left: "6%" },
  { key: "diamond", top: "62%", left: "94%" },
  { key: "shield", top: "84%", left: "22%" },
  { key: "lion", top: "84%", left: "78%" },
  { key: "bolt", top: "94%", left: "50%" },
];

/** ماكينة سباق السيارات — جولات ونتائج من السيرفر بالكامل */
export function SuperCarGame({ roomId = null }: { roomId?: string | null }) {
  const { userId } = useSupabaseSession();
  const wallet = useWallet(userId);
  const refreshMoney = useRefreshMoney();
  const [chip, setChip] = useState(100_000);
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
  const ordered = useMemo(() => {
    const byKey = new Map(slots.map((s) => [s.key, s]));
    const inOrder = GRID_ORDER.map((k) => byKey.get(k)).filter(Boolean) as CarSlot[];
    const rest = slots.filter((s) => !GRID_ORDER.includes(s.key));
    return [...inOrder, ...rest];
  }, [slots]);

  const secondsLeft = round ? Math.max(0, Math.ceil((new Date(round.ends_at).getTime() - now) / 1000)) : 0;
  const betting = round?.status === "betting" && secondsLeft > 0;

  // تشويق ٣ ثوانٍ قبل ظهور النتيجة (النتيجة نفسها محسومة في السيرفر)
  const [shownRound, setShownRound] = useState<string | null>(null);
  const [drumCount, setDrumCount] = useState(0);
  const roundId = round?.id ?? null;
  const winKey = round?.winning_key ?? null;
  const settledAt = round?.settled_at ?? round?.ends_at ?? null;
  useEffect(() => {
    if (!roundId || !winKey) return;
    if (shownRound === roundId) return;
    // نتيجة قديمة (فُتحت الشاشة بعد انتهاء الجولة): تُعرض فورًا
    if (settledAt && Date.now() - new Date(settledAt).getTime() > 10_000) {
      setShownRound(roundId);
      return;
    }
    setDrumCount(3);
    const iv = window.setInterval(() => setDrumCount((c) => Math.max(0, c - 1)), 1000);
    const to = window.setTimeout(() => {
      setShownRound(roundId);
      setDrumCount(0);
      refreshMoney();
    }, 3000);
    return () => {
      window.clearInterval(iv);
      window.clearTimeout(to);
    };
  }, [roundId, winKey, settledAt, shownRound, refreshMoney]);

  const revealed = Boolean(winKey) && shownRound === roundId;
  const drumroll = Boolean(winKey) && shownRound !== roundId;
  const winningSlot = round?.slots?.find((s) => s.key === round.winning_key) ?? null;

  const players = useMemo(
    () => Object.values(totals).reduce((a, t) => a + Number(t?.players ?? 0), 0),
    [totals],
  );
  const othersChips = useMemo(() => {
    const all = Object.values(totals).reduce((a, t) => a + Number(t?.total ?? 0), 0);
    const others = Math.max(0, all - Object.values(mine).reduce((a, b) => a + Number(b ?? 0), 0));
    return others > 0 ? chipStack(others).slice(0, 3) : [];
  }, [totals, mine]);
  const dayWin = useMemo(
    () => (daily.data ?? []).find((r) => r.user_id === userId)?.gross_win ?? 0,
    [daily.data, userId],
  );

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
      {/* قاعة اللعبة */}
      <div className="relative overflow-hidden rounded-[1.75rem] border border-amber-700/50 bg-[radial-gradient(circle_at_50%_0%,rgba(120,53,15,0.85),rgba(28,10,10,0.98))] p-3 pb-4">
        {/* لافتة الجولة */}
        <div className="relative mx-auto mb-2 w-fit rounded-full border-2 border-amber-400/70 bg-gradient-to-b from-amber-600/40 to-stone-950/70 px-6 py-1">
          <span className="text-sm font-black text-amber-100">
            الجولة <span className="text-amber-300">{round?.round_no ?? 0}</span>
            {session ? <span className="text-[10px] text-amber-200/70"> / {session.max_rounds}</span> : null}
          </span>
        </div>

        {/* الحلبة الدائرية */}
        <div className="relative mx-auto aspect-square w-full max-w-[22rem] sm:max-w-[30rem]">
          {/* الإطار الخارجي العنابي */}
          <div className="absolute inset-0 rounded-full border-[10px] border-rose-900/90 bg-gradient-to-b from-rose-900/60 to-stone-950/60 shadow-[0_0_40px_-6px_rgba(245,158,11,0.55)]" />
          {/* شعارات محيط الحلبة */}
          {RING.map((spot) => {
            const art = carArt(spot.key);
            const isWinner = revealed && round?.winning_key === spot.key;
            return (
              <div
                key={spot.key}
                className={cn(
                  "absolute z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-amber-300/70 bg-stone-950/85 p-1 shadow-[0_2px_8px_rgba(0,0,0,0.6)] transition sm:h-11 sm:w-11",
                  isWinner && "scale-125 border-amber-200 shadow-[0_0_16px_rgba(252,211,77,0.95)]",
                )}
                style={{ top: spot.top, left: spot.left }}
              >
                {art && <img src={art} alt="" loading="lazy" width={64} height={64} className="h-full w-full object-contain" />}
              </div>
            );
          })}

          {/* الدائرة الخضراء */}
          <div className="absolute inset-[15%] overflow-hidden rounded-full border-[3px] border-amber-300/80 bg-[radial-gradient(circle_at_50%_30%,#12855a,#065f46_60%,#03311f)] shadow-inner">
            <div className="grid h-full grid-cols-2 grid-rows-5 gap-[1px] p-[7%]">
              {ordered.map((slot) => {
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
                      "flex min-w-0 flex-col items-center justify-center rounded-lg border border-emerald-200/20 bg-emerald-950/25 px-0.5 transition",
                      isWinner && "border-amber-200 bg-amber-400/30 shadow-[inset_0_0_18px_rgba(252,211,77,0.8)]",
                      my > 0 && !isWinner && "border-rose-300/60 bg-rose-900/25",
                      betting ? "active:scale-95" : "opacity-95",
                    )}
                  >
                    <span className="flex items-center justify-center gap-1">
                      {art && (
                        <img
                          src={art}
                          alt={slot.label}
                          loading="lazy"
                          width={64}
                          height={64}
                          className="h-6 w-6 shrink-0 object-contain drop-shadow sm:h-8 sm:w-8"
                        />
                      )}
                      <span className="text-[13px] font-black leading-none text-white drop-shadow sm:text-base">
                        X{slot.multiplier}
                      </span>
                    </span>
                    {my > 0 && (
                      <span className="pointer-events-none mt-0.5 flex items-center justify-center">
                        {chipStack(my).map((c, i) => (
                          <span
                            key={`${slot.key}-chip-${i}`}
                            className={cn(
                              "grid h-4 w-4 place-items-center rounded-full border text-[6px] font-black text-white shadow sm:h-5 sm:w-5 sm:text-[7px]",
                              c.ring,
                              c.face,
                              i > 0 && "-ms-1.5",
                            )}
                          >
                            {formatCompact(c.value)}
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="mt-0.5 flex w-full items-center justify-center gap-1 text-[8px] font-bold leading-none sm:text-[9px]">
                      <span className={cn("truncate", my > 0 ? "text-rose-100" : "text-emerald-200/40")}>
                        {my > 0 ? formatCompact(my) : "—"}
                      </span>
                      {Number(t?.total ?? 0) > 0 && (
                        <span className="truncate text-amber-200/70">/ {formatCompact(Number(t?.total ?? 0))}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* مؤقّت الجولة */}
          <div className="absolute top-0 left-0 z-20 flex h-12 w-12 flex-col items-center justify-center rounded-full border-[3px] border-amber-300/90 bg-gradient-to-b from-amber-500 to-amber-800 text-stone-950 shadow-[0_0_18px_rgba(252,211,77,0.6)] sm:h-16 sm:w-16">
            <AlarmClock className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="text-sm font-black tabular-nums sm:text-xl">{betting ? secondsLeft : "—"}</span>
          </div>

          {/* فقاعة رهانات الآخرين */}
          <div className="absolute -top-1 right-0 z-20 flex flex-col items-center">
            <div className="flex items-center">
              {othersChips.length > 0 ? (
                othersChips.map((c, i) => (
                  <span
                    key={`others-${i}`}
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-full border text-[7px] font-black text-white shadow sm:h-7 sm:w-7 sm:text-[8px]",
                      c.ring,
                      c.face,
                      i > 0 && "-ms-2.5",
                    )}
                  >
                    {formatCompact(c.value)}
                  </span>
                ))
              ) : (
                <Users className="h-6 w-6 text-emerald-400 drop-shadow" />
              )}
            </div>
            <span className="-mt-1 rounded-full border border-amber-300/80 bg-gradient-to-b from-rose-800 to-rose-950 px-2 py-0.5 text-[9px] font-black text-amber-200 shadow">
              others {players > 0 ? players : ""}
            </span>
          </div>

          {/* تشويق ٣ ثوانٍ قبل كشف النتيجة */}
          {drumroll && (
            <div className="absolute inset-[15%] z-30 flex flex-col items-center justify-center rounded-full bg-stone-950/85 text-center backdrop-blur-sm">
              <span className="text-xs font-bold text-amber-200">جاري كشف النتيجة</span>
              <span className="animate-pulse text-5xl font-black text-amber-300 tabular-nums">{drumCount || 1}</span>
              <span className="text-xs font-black text-amber-200/80">{drumCount || 1}S</span>
              <Loader2 className="mt-1 h-4 w-4 animate-spin text-amber-300" />
            </div>
          )}


          {/* لوحة النتيجة */}
          {revealed && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto rounded-full border-[6px] border-amber-400/70 bg-gradient-to-b from-rose-950/95 to-stone-950/98 px-5 py-4 text-center">
              <div className="relative mx-auto w-fit">
                <span className="absolute -start-3 top-1/2 h-3 w-4 -translate-y-1/2 skew-y-12 rounded-s bg-gradient-to-b from-amber-400 to-amber-700" />
                <span className="absolute -end-3 top-1/2 h-3 w-4 -translate-y-1/2 -skew-y-12 rounded-e bg-gradient-to-b from-amber-400 to-amber-700" />
                <div className="rounded-md border-2 border-amber-300/80 bg-gradient-to-b from-rose-600 to-rose-900 px-6 py-0.5 text-xs font-black text-amber-100 shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
                  الجولة {round?.round_no}
                </div>
              </div>
              <div className="relative mt-2 flex flex-col items-center">
                <span className="pointer-events-none absolute inset-0 -m-4 animate-pulse text-amber-200/90">
                  <span className="absolute left-0 top-1 text-xs">✦</span>
                  <span className="absolute right-0 top-2 text-sm">✦</span>
                  <span className="absolute left-2 bottom-8 text-[10px]">✦</span>
                  <span className="absolute right-2 bottom-7 text-xs">✦</span>
                  <span className="absolute left-1/2 top-0 text-[10px]">✦</span>
                </span>
                {carArt(round?.winning_key) && (
                  <img
                    src={carArt(round?.winning_key) as string}
                    alt={winningSlot?.label ?? ""}
                    loading="lazy"
                    width={96}
                    height={96}
                    className="h-14 w-14 object-contain drop-shadow-[0_0_20px_rgba(252,211,77,0.95)]"
                  />
                )}
                <span className="mt-1 text-lg font-black text-amber-300 drop-shadow">
                  X{winningSlot?.multiplier ?? 0}
                </span>
                <span className="text-[11px] text-amber-100/80">{winningSlot?.label ?? ""}</span>
                <span className={cn("mt-1 text-xs font-bold", myPayout > 0 ? "text-emerald-300" : "text-stone-300")}>
                  {myPayout > 0
                    ? `ربحت ${formatCompact(myPayout)} 🎉`
                    : myTotal > 0
                      ? "لم تربح هذه الجولة"
                      : "لم تختر أي سيارة في هذه الجولة"}
                </span>
              </div>
              {winners.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-amber-200/80">أفضل الفائزين في هذه الجولة</p>
                  <div className="mt-1 flex items-center justify-center gap-3">
                    {winners.slice(0, 3).map((w) => (
                      <div key={w.public_id} className="flex flex-col items-center">
                        <UserAvatar src={w.avatar_url} name={w.display_name} className="h-9 w-9 ring-2 ring-amber-300/70" />
                        <span className="max-w-16 truncate text-[10px] text-amber-100">{w.display_name}</span>
                        <span className="text-[10px] font-black text-amber-300">{formatCompact(w.payout)} 💎</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* شرائح الرهان */}
        <div className="mt-3 flex items-center justify-center gap-2 overflow-x-auto pb-1">
          {CHIPS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setChip(c.value)}
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[3px] text-[11px] font-black text-white shadow-lg transition",
                c.ring,
                c.face,
                chip === c.value
                  ? "scale-110 shadow-[0_0_18px_rgba(252,211,77,0.85)] ring-2 ring-amber-200"
                  : "opacity-80",
              )}
            >
              {formatCompact(c.value)}
            </button>
          ))}
          {bet.isPending && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-300" />}
        </div>

        {/* لوحتا مكاسب اليوم والرصيد */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border-2 border-amber-400/50 bg-gradient-to-b from-rose-700/70 to-rose-950/80 px-3 py-2 text-center">
            <p className="text-[10px] text-amber-100/90">مكاسب اليوم</p>
            <p className="text-sm font-black text-amber-200" title={formatFull(dayWin)}>
              {formatCompact(dayWin)}
            </p>
          </div>
          <div className="rounded-2xl border-2 border-amber-400/50 bg-gradient-to-b from-rose-700/70 to-rose-950/80 px-3 py-2 text-center">
            <p className="text-[10px] text-amber-100/90">رصيدي</p>
            <p className="text-sm font-black text-amber-200" title={formatFull(wallet.data?.coins ?? 0)}>
              {formatCompact(wallet.data?.coins ?? 0)} 💎
            </p>
          </div>
        </div>

        {/* شريط النتائج السابقة */}
        {history.length > 0 && (
          <div className="mt-2 flex items-center gap-1 overflow-x-auto rounded-xl border border-amber-700/40 bg-stone-950/80 p-2">
            {history.map((key, i) => {
              const art = carArt(key);
              return (
                <div key={`${key ?? "none"}-${i}`} className="relative shrink-0">
                  {art ? (
                    <img src={art} alt="" loading="lazy" width={40} height={40} className="h-7 w-7 object-contain" />
                  ) : (
                    <span className="block w-7 text-center text-xs text-stone-500">—</span>
                  )}
                  {i === 0 && (
                    <span className="absolute -bottom-1 left-0 rounded-sm bg-emerald-600 px-1 text-[7px] font-black text-white">
                      NEW
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* كأس اليوم */}
      <div className="rounded-2xl border border-amber-600/40 bg-stone-950/70 p-3">
        <p className="mb-2 flex items-center gap-1 text-sm font-bold text-amber-200">
          <Trophy className="h-4 w-4" /> كأس اليوم — أفضل 10
        </p>
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
