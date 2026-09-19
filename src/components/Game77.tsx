import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { play77 } from "@/lib/games.functions";
import { useRefreshMoney } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

const FACES = ["7️⃣", "💎", "⭐", "🔔", "🍋", "🍒"];

const PAYTABLE = [
  { combo: "7️⃣ 7️⃣ 7️⃣", label: "الجائزة الكبرى", mult: "×77" },
  { combo: "ثلاثة متشابهة", label: "أي رمز", mult: "×7" },
  { combo: "سبعتان", label: "7️⃣ 7️⃣", mult: "×6" },
  { combo: "سبعة واحدة", label: "7️⃣", mult: "×0.8" },
  { combo: "زوج متشابه", label: "رمزان", mult: "×0.4" },
];

/** لعبة 77: البكرات تُحسم على السيرفر، والحركة هنا عرض فقط */
export function Game77({ bet, onSettled }: { bet: number; onSettled?: (text: string) => void }) {
  const refreshMoney = useRefreshMoney();
  const [reels, setReels] = useState<string[]>(["7️⃣", "💎", "⭐"]);
  const [spinning, setSpinning] = useState(false);
  const [outcome, setOutcome] = useState<{ label: string; payout: number; multiplier: number } | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const spin = useMutation({
    mutationFn: async () => play77({ data: { bet } }),
    onMutate: () => {
      setOutcome(null);
      setSpinning(true);
    },
    onSuccess: (r) => {
      // توقف البكرات واحدة تلو الأخرى على نتيجة السيرفر
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
        refreshMoney();
        onSettled?.(
          r.payout > 0
            ? `7️⃣ ${r.label} — ربحت ${r.payout.toLocaleString("en-US")} كوينز`
            : `7️⃣ ${r.label} — لا ربح هذه الجولة`,
        );
      }, 1750);
      timers.current.push(end);
      stop(0, 700);
      stop(1, 1150);
      stop(2, 1600);
    },
    onError: (e) => {
      setSpinning(false);
      toast.error(e instanceof Error ? e.message : "تعذر تشغيل اللعبة");
    },
  });

  return (
    <div className="surface-card overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold">لعبة 77</p>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
          ثلاث بكرات · النتيجة من السيرفر
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-3xl gradient-gold p-2">
        {reels.map((face, i) => (
          <div
            key={i}
            className={cn(
              "flex h-24 items-center justify-center rounded-2xl bg-background/85 text-4xl shadow-inner transition-transform",
              spinning && "animate-pulse",
            )}
          >
            <span className="emoji">{face}</span>
          </div>
        ))}
      </div>

      {outcome && (
        <p
          className={cn(
            "mt-3 rounded-2xl py-2 text-center text-xs font-extrabold",
            outcome.payout > 0 ? "bg-success/15 text-success" : "bg-surface-2 text-muted-foreground",
          )}
        >
          {outcome.label}
          {outcome.payout > 0 ? ` · +${outcome.payout.toLocaleString("en-US")} كوينز (×${outcome.multiplier})` : ""}
        </p>
      )}

      <Button
        onClick={() => spin.mutate()}
        disabled={spinning || spin.isPending}
        className="mt-3 h-12 w-full rounded-2xl gradient-gold text-base font-extrabold text-primary-foreground"
      >
        {spinning ? <Loader2 className="h-4 w-4 animate-spin" /> : `دوّر بـ ${bet.toLocaleString("en-US")} كوينز`}
      </Button>

      <div className="mt-3 space-y-1.5 rounded-2xl bg-surface-2 p-3">
        <p className="text-[11px] font-extrabold">جدول الأرباح</p>
        {PAYTABLE.map((row) => (
          <div key={row.combo} className="flex items-center justify-between text-[11px]">
            <span className="emoji font-bold">{row.combo}</span>
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-extrabold text-primary">{row.mult}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
