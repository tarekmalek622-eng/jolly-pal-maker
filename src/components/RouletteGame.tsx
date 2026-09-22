import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { spinWheel } from "@/lib/games.functions";
import { useRefreshMoney } from "@/hooks/use-session";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import wheelArt from "@/assets/roulette/wheel.png";
import ballArt from "@/assets/roulette/ball.png";

/** نفس ترتيب خانات السيرفر، مكرّرة مرتين لتشكيل 14 جيبًا على الصورة */
const LABELS = ["لا شيء", "×0.5", "×1", "×2", "×3", "×5", "×10"] as const;
const POCKETS = [...LABELS, ...LABELS];
const SEG = 360 / POCKETS.length;

const BET_STEPS = [10_000_000, 50_000_000, 100_000_000, 200_000_000];

/** لعبة الروليت — العجلة صورة حقيقية والنتيجة تُحسم على السيرفر */
export function RouletteGame({ bet: initialBet }: { bet?: number }) {
  const refreshMoney = useRefreshMoney();
  const [betIndex, setBetIndex] = useState(() => {
    const i = BET_STEPS.indexOf(initialBet ?? BET_STEPS[0]!);
    return i >= 0 ? i : 0;
  });
  const currentBet = BET_STEPS[betIndex] ?? BET_STEPS[0]!;
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<{ label: string; payout: number } | null>(null);
  const [history, setHistory] = useState<{ label: string; payout: number }[]>([]);
  const [todayWin, setTodayWin] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const spin = useMutation({
    mutationFn: async () => spinWheel({ data: { bet: currentBet } }),
    onMutate: () => {
      setOutcome(null);
      setSpinning(true);
      setCountdown(3);
      [1, 2].forEach((n) => {
        const t = window.setTimeout(() => setCountdown(3 - n), n * 1000);
        timers.current.push(t);
      });
    },
    onSuccess: (r) => {
      const matches = POCKETS.map((l, i) => (l === r.label ? i : -1)).filter((i) => i >= 0);
      const target = matches[Math.floor(Math.random() * matches.length)] ?? 0;
      const center = target * SEG + SEG / 2;
      setRotation((prev) => prev + 5 * 360 + ((360 - (center + (prev % 360))) % 360));
      const end = window.setTimeout(() => {
        setSpinning(false);
        setCountdown(null);
        setOutcome({ label: r.label, payout: r.payout });
        setTodayWin((v) => v + r.payout);
        setHistory((h) => [{ label: r.label, payout: r.payout }, ...h].slice(0, 10));
        refreshMoney();
      }, 3000);
      timers.current.push(end);
    },
    onError: (e) => {
      setSpinning(false);
      setCountdown(null);
      toast.error(e instanceof Error ? e.message : "تعذر تشغيل اللعبة");
    },
  });

  const ring = useMemo(
    () =>
      POCKETS.map((label, i) => ({
        label,
        angle: i * SEG + SEG / 2,
      })),
    [],
  );

  const busy = spinning || spin.isPending;

  return (
    <div className="overflow-hidden rounded-3xl border-2 border-amber-400/60 bg-[linear-gradient(180deg,#2b1206,#120604)] p-3 shadow-[0_0_24px_rgba(255,190,80,0.25)]">
      <div className="rounded-2xl bg-[linear-gradient(180deg,#8a1f1f,#3b0d0d)] px-3 py-2 text-center">
        <p className="text-lg font-black tracking-widest text-amber-300 drop-shadow-[0_2px_0_rgba(0,0,0,0.5)]">
          ROULETTE
        </p>
        <p className="mt-1 inline-flex items-center rounded-full border border-amber-400/50 bg-black/40 px-3 py-0.5 font-mono text-xs font-bold text-amber-200">
          {(currentBet * 10).toLocaleString("en-US")}
        </p>
      </div>

      {/* العجلة */}
      <div className="relative mx-auto mt-3 aspect-square w-full max-w-[320px]">
        {/* مؤشر أعلى العجلة */}
        <span className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1 text-2xl text-amber-300">▼</span>
        <div
          className="absolute inset-0 transition-transform duration-[3000ms] ease-[cubic-bezier(0.12,0.72,0.06,1)]"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <img
            src={wheelArt}
            alt="عجلة الروليت"
            loading="lazy"
            width={1024}
            height={1024}
            className="h-full w-full select-none object-contain"
          />
          {ring.map((p, i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 origin-center"
              style={{ transform: `rotate(${p.angle}deg) translateY(-40%)` }}
            >
              <span
                className="block text-[10px] font-black text-amber-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                style={{ transform: `rotate(${-p.angle - rotation}deg)` }}
              >
                {p.label}
              </span>
            </span>
          ))}
        </div>
        <img
          src={ballArt}
          alt="كرة الروليت"
          loading="lazy"
          width={816}
          height={816}
          className={cn(
            "absolute left-1/2 top-[8%] z-10 h-5 w-5 -translate-x-1/2 object-contain drop-shadow",
            busy && "animate-bounce",
          )}
        />
        {countdown !== null && countdown > 0 && (
          <span className="absolute bottom-2 left-2 z-20 rounded-xl border border-amber-300/60 bg-black/70 px-2 py-1 text-xs font-black text-amber-200">
            {countdown}S
          </span>
        )}
      </div>

      {/* شريط الجولة */}
      <p className="mx-auto mt-2 w-fit rounded-full border border-amber-300/60 bg-[linear-gradient(180deg,#f3c968,#b8801f)] px-4 py-1 text-[11px] font-black text-[#3b1d02]">
        {busy ? "جارٍ الدوران…" : outcome ? `النتيجة: ${outcome.label}` : "اختر رهانك ثم ابدأ"}
      </p>

      {/* لوحة النتيجة */}
      {outcome && (
        <div
          className={cn(
            "mt-2 rounded-2xl p-3 text-center",
            outcome.payout > 0 ? "bg-emerald-500/15" : "bg-black/40",
          )}
        >
          <p className={cn("text-2xl font-black", outcome.payout > 0 ? "text-emerald-300" : "text-amber-100/70")}>
            {outcome.label}
          </p>
          <p className="mt-1 text-xs font-bold text-amber-100/80">
            {outcome.payout > 0
              ? `ربحت ${outcome.payout.toLocaleString("en-US")} كوينز`
              : "لا ربح هذه الجولة"}
          </p>
        </div>
      )}

      {/* الأرقام */}
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-amber-400/50 bg-emerald-900/70 px-2 py-1.5 text-center">
          <p className="text-[10px] text-amber-200/80">الرهان</p>
          <p className="text-sm font-black text-emerald-200">{formatCompact(currentBet)}</p>
        </div>
        <div className="rounded-xl border border-amber-400/50 bg-black/50 px-2 py-1.5 text-center">
          <p className="text-[10px] text-amber-200/80">مكاسب اليوم</p>
          <p className="text-sm font-black text-amber-200">{formatCompact(todayWin)}</p>
        </div>
        <div className="rounded-xl border border-amber-400/50 bg-red-900/70 px-2 py-1.5 text-center">
          <p className="text-[10px] text-amber-200/80">الربح</p>
          <p className="text-sm font-black text-rose-100">{formatCompact(outcome?.payout ?? 0)}</p>
        </div>
      </div>

      {/* التحكم */}
      <div className="mt-2 flex items-stretch gap-2">
        <div className="flex flex-1 flex-wrap gap-1">
          {BET_STEPS.map((n, i) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              onClick={() => setBetIndex(i)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[11px] font-bold disabled:opacity-50",
                betIndex === i
                  ? "border-amber-300 bg-amber-400/25 text-amber-100"
                  : "border-amber-400/40 bg-black/40 text-amber-200/70",
              )}
            >
              {formatCompact(n)}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => spin.mutate()}
          aria-label="تكرار"
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/60 bg-cyan-800/80 text-amber-100 disabled:opacity-50"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => spin.mutate()}
          className="flex h-12 flex-1 items-center justify-center rounded-xl border-2 border-amber-300/70 bg-[linear-gradient(180deg,#34d399,#047857)] text-lg font-black text-white shadow-[0_4px_0_rgba(0,0,0,0.35)] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "SPIN"}
        </button>
      </div>

      {/* شريط السجل */}
      {history.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto rounded-2xl bg-black/40 p-2">
          {history.map((h, i) => (
            <span
              key={i}
              className={cn(
                "shrink-0 rounded-lg px-2 py-1 text-[10px] font-black",
                h.payout > 0 ? "bg-emerald-500/25 text-emerald-200" : "bg-red-900/60 text-rose-200",
              )}
            >
              {h.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
