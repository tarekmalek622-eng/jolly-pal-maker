import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Minus, Plus, Repeat } from "lucide-react";
import { play77 } from "@/lib/games.functions";
import { useRefreshMoney } from "@/hooks/use-session";
import { slotArt } from "@/lib/slot-art";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const FACES = ["7️⃣", "💎", "⭐", "🔔", "🍋", "🍒"];
const BET_STEPS = [10_000_000, 50_000_000, 100_000_000, 200_000_000];

const PAYTABLE = [
  { combo: "7️⃣ 7️⃣ 7️⃣", label: "الجائزة الكبرى", mult: "×77" },
  { combo: "ثلاثة متشابهة", label: "أي رمز", mult: "×7" },
  { combo: "سبعتان", label: "7️⃣ 7️⃣", mult: "×6" },
  { combo: "سبعة واحدة", label: "7️⃣", mult: "×0.8" },
  { combo: "زوج متشابه", label: "رمزان", mult: "×0.4" },
];

function Face({ face, spinning }: { face: string; spinning: boolean }) {
  const src = slotArt(face);
  return (
    <div
      className={cn(
        "flex h-24 items-center justify-center rounded-xl border border-amber-300/40 bg-[radial-gradient(circle_at_50%_30%,#fffaf0,#f6e3bd)] shadow-inner",
        spinning && "animate-pulse",
      )}
    >
      {src ? (
        <img
          src={src}
          alt={face}
          loading="lazy"
          width={816}
          height={816}
          className="h-16 w-16 object-contain"
        />
      ) : (
        <span className="emoji text-4xl">{face}</span>
      )}
    </div>
  );
}

/** لعبة 77 بواجهة ماكينة ذهبية — البكرات تُحسم على السيرفر والحركة عرض فقط */
export function Game77({ bet, onSettled }: { bet: number; onSettled?: (text: string) => void }) {
  const refreshMoney = useRefreshMoney();
  const [reels, setReels] = useState<string[]>(["7️⃣", "💎", "⭐"]);
  const [spinning, setSpinning] = useState(false);
  const [betIndex, setBetIndex] = useState(() => {
    const i = BET_STEPS.indexOf(bet);
    return i >= 0 ? i : 0;
  });
  const [auto, setAuto] = useState(false);
  const [todayWin, setTodayWin] = useState(0);
  const [outcome, setOutcome] = useState<{
    label: string;
    payout: number;
    multiplier: number;
  } | null>(null);
  const timers = useRef<number[]>([]);
  const currentBet = BET_STEPS[betIndex] ?? BET_STEPS[0]!;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const spin = useMutation({
    mutationFn: async () => play77({ data: { bet: currentBet } }),
    onMutate: () => {
      setOutcome(null);
      setSpinning(true);
    },
    onSuccess: (r) => {
      const rolling = window.setInterval(
        () => setReels(() => [0, 1, 2].map(() => FACES[Math.floor(Math.random() * FACES.length)]!)),
        70,
      );
      const stop = (index: number, delay: number) => {
        const t = window.setTimeout(() => {
          setReels((prev) => prev.map((face, i) => (i === index ? r.reels[index]! : face)));
        }, delay);
        timers.current.push(t);
      };
      const end = window.setTimeout(() => {
        window.clearInterval(rolling);
        setReels(r.reels);
        setSpinning(false);
        setOutcome({ label: r.label, payout: r.payout, multiplier: r.multiplier });
        setTodayWin((v) => v + r.payout);
        refreshMoney();
        onSettled?.(
          r.payout > 0
            ? `7️⃣ ${r.label} — ربحت ${r.payout.toLocaleString("en-US")} كوينز`
            : `7️⃣ ${r.label} — لا ربح هذه الجولة`,
        );
        if (auto) {
          const again = window.setTimeout(() => spin.mutate(), 900);
          timers.current.push(again);
        }
      }, 1750);
      timers.current.push(end);
      stop(0, 700);
      stop(1, 1150);
      stop(2, 1600);
    },
    onError: (e) => {
      setSpinning(false);
      setAuto(false);
      toast.error(e instanceof Error ? e.message : "تعذر تشغيل اللعبة");
    },
  });

  const busy = spinning || spin.isPending;

  return (
    <div className="overflow-hidden rounded-3xl border-2 border-amber-400/60 bg-[linear-gradient(180deg,#5b1f14,#2c0f0a)] p-2 shadow-[0_0_24px_rgba(255,190,80,0.25)]">
      {/* لوحة الجاكبوت */}
      <div className="rounded-2xl bg-[linear-gradient(180deg,#8a1f1f,#3b0d0d)] px-3 py-2 text-center">
        <p className="text-xl font-black tracking-widest text-amber-300 drop-shadow-[0_2px_0_rgba(0,0,0,0.5)]">
          JACKPOT 77
        </p>
        <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-black/40 px-3 py-0.5 font-mono text-sm font-bold text-amber-200">
          {(currentBet * 77).toLocaleString("en-US")}
        </p>
      </div>

      {/* البكرات */}
      <div className="mt-2 rounded-2xl border-2 border-amber-400/70 bg-[linear-gradient(180deg,#c99a45,#8a6322)] p-2">
        <div className="grid grid-cols-3 gap-2">
          {reels.map((face, i) => (
            <Face key={i} face={face} spinning={busy} />
          ))}
        </div>
      </div>

      {/* شرائح الأرقام */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-amber-400/50 bg-emerald-900/70 px-2 py-1.5 text-center">
          <p className="text-[10px] text-amber-200/80">الرهان</p>
          <p className="text-sm font-black text-emerald-200">{formatCompact(currentBet)}</p>
        </div>
        <div className="rounded-xl border border-amber-400/50 bg-black/50 px-2 py-1.5 text-center">
          <p className="text-[10px] text-amber-200/80">ربح اليوم</p>
          <p className="text-sm font-black text-amber-200">{formatCompact(todayWin)}</p>
        </div>
        <div className="rounded-xl border border-amber-400/50 bg-red-900/70 px-2 py-1.5 text-center">
          <p className="text-[10px] text-amber-200/80">الربح</p>
          <p className="text-sm font-black text-rose-100">{formatCompact(outcome?.payout ?? 0)}</p>
        </div>
      </div>

      {outcome && (
        <p
          className={cn(
            "mt-2 rounded-xl py-1.5 text-center text-xs font-extrabold",
            outcome.payout > 0
              ? "bg-emerald-500/20 text-emerald-200"
              : "bg-black/40 text-amber-100/70",
          )}
        >
          {outcome.label}
          {outcome.payout > 0 ? ` · ×${outcome.multiplier}` : ""}
        </p>
      )}

      {/* أزرار التحكم */}
      <div className="mt-2 flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => setBetIndex((i) => Math.max(0, i - 1))}
          disabled={busy}
          aria-label="تقليل الرهان"
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/60 bg-cyan-800/80 text-amber-100 disabled:opacity-50"
        >
          <Minus className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setBetIndex((i) => Math.min(BET_STEPS.length - 1, i + 1))}
          disabled={busy}
          aria-label="زيادة الرهان"
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/60 bg-cyan-800/80 text-amber-100 disabled:opacity-50"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setAuto((v) => !v)}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/60 text-amber-100",
            auto ? "bg-amber-500/80" : "bg-cyan-800/80",
          )}
          aria-label="تدوير تلقائي"
        >
          <Repeat className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => spin.mutate()}
          disabled={busy}
          className="flex h-12 flex-1 items-center justify-center rounded-xl border-2 border-amber-300/70 bg-[linear-gradient(180deg,#34d399,#047857)] text-lg font-black text-white shadow-[0_4px_0_rgba(0,0,0,0.35)] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "SPIN"}
        </button>
      </div>

      {/* جدول الأرباح */}
      <div className="mt-2 space-y-1 rounded-2xl bg-black/40 p-3">
        <p className="text-[11px] font-extrabold text-amber-200">جدول الأرباح</p>
        {PAYTABLE.map((row) => (
          <div
            key={row.combo}
            className="flex items-center justify-between text-[11px] text-amber-100/80"
          >
            <span className="emoji font-bold">{row.combo}</span>
            <span>{row.label}</span>
            <span className="font-extrabold text-amber-300">{row.mult}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
