import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Dices, Loader2, Sparkles, Spade, HelpCircle, Flame, LayoutGrid } from "lucide-react";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DominoGame } from "@/components/DominoGame";
import { supabase } from "@/integrations/supabase/client";
import { playDice, spinWheel, playCards, startQuiz, answerQuiz, playChallenge } from "@/lib/games.functions";
import { useRefreshMoney, useSupabaseSession, useWallet } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/games")({
  validateSearch: (search: Record<string, unknown>): { room?: string } => {
    const room = search["room"];
    return typeof room === "string" ? { room } : {};
  },
  head: () => ({
    meta: [
      { title: "الألعاب — صوتك" },
      {
        name: "description",
        content:
          "الدومينو الجماعي والنرد وعجلة الحظ والورق والأسئلة والتحديات بالكوينز الافتراضية — للترفيه فقط بدون أموال حقيقية.",
      },
      { property: "og:title", content: "الألعاب — صوتك" },
      { property: "og:description", content: "ستة ألعاب بالكوينز الافتراضية، للترفيه فقط." },
    ],
  }),
  component: GamesPage,
});

type GameKey = "domino" | "dice" | "wheel" | "cards" | "quiz" | "challenge";

const GAME_TABS: { key: GameKey; label: string; icon: typeof Dices; flag: string }[] = [
  { key: "domino", label: "دومينو", icon: LayoutGrid, flag: "domino" },
  { key: "dice", label: "النرد", icon: Dices, flag: "dice" },
  { key: "wheel", label: "العجلة", icon: Sparkles, flag: "wheel" },
  { key: "cards", label: "الورق", icon: Spade, flag: "cards" },
  { key: "quiz", label: "الأسئلة", icon: HelpCircle, flag: "quiz" },
  { key: "challenge", label: "التحديات", icon: Flame, flag: "quiz" },
];

const CHALLENGES = [
  { key: "reflex", label: "سرعة البديهة", hint: "ربح ×2" },
  { key: "memory", label: "الذاكرة", hint: "ربح ×3" },
  { key: "luck", label: "الحظ الكبير", hint: "ربح ×7" },
] as const;

function GamesPage() {
  const { userId } = useSupabaseSession();
  const wallet = useWallet(userId);
  const refresh = useRefreshMoney();
  const [game, setGame] = useState<GameKey>("dice");
  const [bet, setBet] = useState(100);
  const [guess, setGuess] = useState(6);
  const [challenge, setChallenge] = useState<"reflex" | "memory" | "luck">("reflex");
  const [result, setResult] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<{ sessionId: string; question: string; choices: string[] } | null>(null);

  const settings = useQuery({
    queryKey: ["game-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("key, value").in("key", ["games", "limits"]);
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value]));
      return {
        games: (map.get("games") ?? {}) as Record<string, boolean | undefined>,
        limits: (map.get("limits") ?? { min_bet: 50, max_bet: 5000 }) as { min_bet: number; max_bet: number },
      };
    },
  });

  const sessions = useQuery({
    queryKey: ["game-sessions", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_sessions")
        .select("id, game, bet, payout, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const afterPlay = (message: string) => {
    setResult(message);
    refresh();
    void sessions.refetch();
  };

  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "تعذر تشغيل اللعبة");

  const dice = useMutation({
    mutationFn: async () => playDice({ data: { bet, guess } }),
    onSuccess: (r) =>
      afterPlay(
        r.won
          ? `🎲 النتيجة ${r.roll} — فزت بـ ${r.payout.toLocaleString("en-US")} كوينز`
          : `🎲 النتيجة ${r.roll} — خسرت ${bet.toLocaleString("en-US")} كوينز`,
      ),
    onError: fail,
  });

  const wheel = useMutation({
    mutationFn: async () => spinWheel({ data: { bet } }),
    onSuccess: (r) =>
      afterPlay(r.payout > 0 ? `🎡 ${r.label} — ربحت ${r.payout.toLocaleString("en-US")} كوينز` : `🎡 ${r.label} — لا ربح`),
    onError: fail,
  });

  const cards = useMutation({
    mutationFn: async () => playCards({ data: { bet } }),
    onSuccess: (r) =>
      afterPlay(
        `🃏 بطاقتك ${r.player} · الموزع ${r.dealer} — ` +
          (r.outcome === "win"
            ? `فزت بـ ${r.payout.toLocaleString("en-US")} كوينز`
            : r.outcome === "draw"
              ? "تعادل، استُرد رهانك"
              : "خسرت الجولة"),
      ),
    onError: fail,
  });

  const startQuizRound = useMutation({
    mutationFn: async () => startQuiz({ data: { bet } }),
    onSuccess: (r) => {
      setResult(null);
      setQuiz(r);
    },
    onError: fail,
  });

  const answer = useMutation({
    mutationFn: async (choice: number) => answerQuiz({ data: { sessionId: quiz!.sessionId, choice } }),
    onSuccess: (r) => {
      const correctText = quiz?.choices[r.correctIndex] ?? "";
      setQuiz(null);
      afterPlay(
        r.correct
          ? `✅ إجابة صحيحة — ربحت ${r.payout.toLocaleString("en-US")} كوينز`
          : `❌ إجابة خاطئة — الصحيح: ${correctText}`,
      );
    },
    onError: fail,
  });

  const challengeRun = useMutation({
    mutationFn: async () => playChallenge({ data: { bet, challenge } }),
    onSuccess: (r) =>
      afterPlay(r.won ? `🔥 ${r.label} — نجحت وربحت ${r.payout.toLocaleString("en-US")} كوينز` : `🔥 ${r.label} — لم تنجح`),
    onError: fail,
  });

  const busy =
    dice.isPending ||
    wheel.isPending ||
    cards.isPending ||
    startQuizRound.isPending ||
    answer.isPending ||
    challengeRun.isPending;

  const flags = settings.data?.games ?? {};
  const limits = settings.data?.limits ?? { min_bet: 50, max_bet: 5000 };
  const tabs = GAME_TABS.filter((t) => flags[t.flag] !== false);
  const active = tabs.some((t) => t.key === game) ? game : tabs[0]?.key;

  const play = () => {
    if (active === "dice") dice.mutate();
    else if (active === "wheel") wheel.mutate();
    else if (active === "cards") cards.mutate();
    else if (active === "quiz") startQuizRound.mutate();
    else if (active === "challenge") challengeRun.mutate();
  };

  return (
    <AppShell
      header={
        <PageHeader title="الألعاب" subtitle={`رصيدك: ${(wallet.data?.coins ?? 0).toLocaleString("en-US")} كوينز`} />
      }
    >
      {tabs.length === 0 ? (
        <EmptyState title="كل الألعاب موقوفة حاليًا" />
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto rounded-2xl bg-surface p-1">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setGame(key);
                  setResult(null);
                  setQuiz(null);
                }}
                className={cn(
                  "flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition-colors",
                  active === key ? "gradient-gold text-primary-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="surface-card p-5">
            <p className="text-sm font-bold">
              مبلغ الرهان (بين {limits.min_bet.toLocaleString("en-US")} و {limits.max_bet.toLocaleString("en-US")})
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[50, 100, 500, 1000, 5000]
                .filter((n) => n >= limits.min_bet && n <= limits.max_bet)
                .map((n) => (
                  <button
                    key={n}
                    onClick={() => setBet(n)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs",
                      bet === n
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-surface-2 text-muted-foreground",
                    )}
                  >
                    {n.toLocaleString("en-US")}
                  </button>
                ))}
            </div>
            <Input
              type="number"
              value={bet}
              min={limits.min_bet}
              onChange={(e) => setBet(Math.max(1, Number(e.target.value) || 1))}
              className="mt-3 h-11 rounded-2xl bg-surface-2"
            />

            {active === "dice" && (
              <>
                <p className="mt-5 text-sm font-bold">اختر رقمك (الربح ×5)</p>
                <div className="mt-3 flex gap-2">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      onClick={() => setGuess(n)}
                      className={cn(
                        "h-11 flex-1 rounded-xl border text-sm font-bold",
                        guess === n
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-surface-2 text-muted-foreground",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}

            {active === "cards" && (
              <p className="mt-5 text-xs text-muted-foreground">
                تسحب بطاقة أمام الموزع — البطاقة الأعلى تربح ×2، والتعادل يعيد رهانك.
              </p>
            )}

            {active === "challenge" && (
              <>
                <p className="mt-5 text-sm font-bold">اختر التحدي</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {CHALLENGES.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setChallenge(c.key)}
                      className={cn(
                        "rounded-xl border px-2 py-3 text-[11px] font-bold",
                        challenge === c.key
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-surface-2 text-muted-foreground",
                      )}
                    >
                      {c.label}
                      <span className="mt-1 block text-[9px] font-normal opacity-70">{c.hint}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {active === "quiz" && quiz ? (
              <div className="mt-5 space-y-2">
                <p className="text-sm font-bold">{quiz.question}</p>
                {quiz.choices.map((choice, index) => (
                  <button
                    key={choice}
                    disabled={answer.isPending}
                    onClick={() => answer.mutate(index)}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3 py-3 text-start text-xs"
                  >
                    {choice}
                  </button>
                ))}
                <p className="text-[10px] text-muted-foreground">الإجابة الصحيحة تربح ×3 من رهانك.</p>
              </div>
            ) : (
              <Button
                disabled={busy}
                onClick={play}
                className="mt-6 h-13 w-full rounded-2xl gradient-gold py-4 font-bold text-primary-foreground"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : active === "dice" ? (
                  "ارمِ النرد"
                ) : active === "wheel" ? (
                  "أدر العجلة"
                ) : active === "cards" ? (
                  "اسحب بطاقة"
                ) : active === "quiz" ? (
                  "ابدأ سؤالًا"
                ) : (
                  "ابدأ التحدي"
                )}
              </Button>
            )}

            {result && <p className="mt-4 text-center text-sm font-semibold">{result}</p>}
          </div>
        </>
      )}

      <div className="mt-5">
        <p className="mb-2 text-sm font-bold">سجل الألعاب</p>
        {(sessions.data?.length ?? 0) === 0 ? (
          <EmptyState title="لا توجد جلسات بعد" />
        ) : (
          <div className="space-y-2">
            {sessions.data?.map((s) => (
              <div key={s.id} className="surface-card flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">
                    {s.game === "dice"
                      ? "النرد"
                      : s.game === "wheel"
                        ? "عجلة الحظ"
                        : s.game === "cards"
                          ? "الورق"
                          : s.game === "quiz"
                            ? "الأسئلة"
                            : "التحديات"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(s.created_at).toLocaleString("ar")}
                    {s.status === "pending" ? " · جارية" : ""}
                  </p>
                </div>
                <p className={cn("text-xs font-bold", s.payout >= s.bet ? "text-success" : "text-muted-foreground")}>
                  {s.payout - s.bet >= 0 ? "+" : ""}
                  {(s.payout - s.bet).toLocaleString("en-US")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        كل الألعاب بالكوينز الافتراضية فقط — لا أموال حقيقية ولا سحب نقدي.
      </p>
    </AppShell>
  );
}
