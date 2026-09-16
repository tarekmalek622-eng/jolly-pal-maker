import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Dices, Loader2, Sparkles } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { playDice, spinWheel } from "@/lib/games.functions";
import { useRefreshMoney, useSupabaseSession, useWallet } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/games")({
  head: () => ({
    meta: [
      { title: "الألعاب — صوتك" },
      { name: "description", content: "العب النرد وعجلة الحظ بالكوينز الافتراضية داخل التطبيق — للترفيه فقط بدون أموال حقيقية." },
      { property: "og:title", content: "الألعاب — صوتك" },
      { property: "og:description", content: "نرد وعجلة حظ بالكوينز الافتراضية، للترفيه فقط." },
    ],
  }),
  component: GamesPage,
});

function GamesPage() {
  const { userId } = useSupabaseSession();
  const wallet = useWallet(userId);
  const refresh = useRefreshMoney();
  const [game, setGame] = useState<"dice" | "wheel">("dice");
  const [bet, setBet] = useState(100);
  const [guess, setGuess] = useState(6);
  const [result, setResult] = useState<string | null>(null);

  const dice = useMutation({
    mutationFn: async () => playDice({ data: { bet, guess } }),
    onSuccess: (r) => {
      setResult(
        r.won
          ? `🎲 النتيجة ${r.roll} — فزت بـ ${r.payout.toLocaleString("en-US")} كوينز`
          : `🎲 النتيجة ${r.roll} — خسرت ${bet.toLocaleString("en-US")} كوينز`,
      );
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تشغيل اللعبة"),
  });

  const wheel = useMutation({
    mutationFn: async () => spinWheel({ data: { bet } }),
    onSuccess: (r) => {
      setResult(
        r.payout > 0
          ? `🎡 ${r.label} — ربحت ${r.payout.toLocaleString("en-US")} كوينز`
          : `🎡 ${r.label} — لا ربح هذه المرة`,
      );
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تشغيل اللعبة"),
  });

  const busy = dice.isPending || wheel.isPending;

  return (
    <AppShell
      header={
        <PageHeader title="الألعاب" subtitle={`رصيدك: ${(wallet.data?.coins ?? 0).toLocaleString("en-US")} كوينز`} />
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1">
        {([["dice", "النرد", Dices], ["wheel", "عجلة الحظ", Sparkles]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => {
              setGame(key);
              setResult(null);
            }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-colors",
              game === key ? "gradient-gold text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="surface-card p-5">
        <p className="text-sm font-bold">مبلغ الرهان (كوينز افتراضية)</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[50, 100, 500, 1000, 5000].map((n) => (
            <button
              key={n}
              onClick={() => setBet(n)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs",
                bet === n ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              {n.toLocaleString("en-US")}
            </button>
          ))}
        </div>
        <Input
          type="number"
          value={bet}
          min={10}
          onChange={(e) => setBet(Math.max(10, Number(e.target.value) || 10))}
          className="mt-3 h-11 rounded-2xl bg-surface-2"
        />

        {game === "dice" && (
          <>
            <p className="mt-5 text-sm font-bold">اختر رقمك (الربح ×5)</p>
            <div className="mt-3 flex gap-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => setGuess(n)}
                  className={cn(
                    "h-11 flex-1 rounded-xl border text-sm font-bold",
                    guess === n ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </>
        )}

        <Button
          disabled={busy}
          onClick={() => (game === "dice" ? dice.mutate() : wheel.mutate())}
          className="mt-6 h-13 w-full rounded-2xl gradient-gold py-4 font-bold text-primary-foreground"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : game === "dice" ? "ارمِ النرد" : "أدر العجلة"}
        </Button>

        {result && <p className="mt-4 text-center text-sm font-semibold">{result}</p>}
      </div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        كل الألعاب بالكوينز الافتراضية فقط — لا أموال حقيقية ولا سحب نقدي.
      </p>
    </AppShell>
  );
}
