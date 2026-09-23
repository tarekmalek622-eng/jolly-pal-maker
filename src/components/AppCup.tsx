import { useQuery } from "@tanstack/react-query";
import { Crown, Loader2, Trophy } from "lucide-react";
import { useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { getAppCupLeaderboard, type CupEntry } from "@/lib/cups.functions";
import { cn } from "@/lib/utils";

const PERIODS = [
  ["day", "يومي"],
  ["week", "أسبوعي"],
  ["month", "شهري"],
] as const;
const CATEGORIES = [
  ["supporters", "الداعمون"],
  ["rooms", "الغرف"],
  ["receivers", "المستلمون"],
  ["topups", "الشاحنون"],
  ["game_wins", "مكاسب الألعاب"],
] as const;
const MEDALS = ["🥇", "🥈", "🥉"];

export function AppCup() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("day");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number][0]>("supporters");
  const board = useQuery({
    queryKey: ["app-cup", category, period],
    queryFn: () => getAppCupLeaderboard({ data: { category, period } }),
    staleTime: 60_000,
  });

  return (
    <section className="overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-b from-amber-400/10 to-surface p-3 shadow-lg">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-amber-400/15">
          <Trophy className="h-5 w-5 text-amber-400" />
        </span>
        <div className="flex-1">
          <h2 className="text-sm font-black">كأس التطبيق</h2>
          <p className="text-[10px] text-muted-foreground">ترتيب حقيقي من العمليات المؤكدة</p>
        </div>
        <Crown className="h-5 w-5 text-amber-400" />
      </div>
      <div className="mb-2 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {PERIODS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold",
              period === key
                ? "gradient-gold text-primary-foreground"
                : "bg-surface-2 text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {CATEGORIES.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[10px]",
              category === key
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {board.isLoading ? (
        <div className="grid h-28 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (board.data?.length ?? 0) === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">
          تبدأ المراكز مع أول عملية مؤكدة في هذه الفترة.
        </p>
      ) : (
        <ol className="grid gap-2 sm:grid-cols-2">
          {(board.data ?? []).map((entry: CupEntry, i) => (
            <li
              key={entry.entity_id}
              className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/55 p-2"
            >
              <span className="w-7 text-center text-sm font-black">{MEDALS[i] ?? i + 1}</span>
              <UserAvatar
                src={entry.avatar_url ?? entry.image_url}
                name={entry.display_name}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{entry.display_name}</p>
                <p className="text-[9px] text-muted-foreground">ID: {entry.public_id}</p>
              </div>
              <b className="text-[11px] text-amber-400">
                {Number(entry.score).toLocaleString("en-US")} ⭐
              </b>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
