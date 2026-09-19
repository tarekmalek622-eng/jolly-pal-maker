import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BarChart3, Coins, Gamepad2, Gift, Loader2, Trophy, Users } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { getAppCupLeaderboard, type CupEntry } from "@/lib/cups.functions";
import { getBreakAppStats } from "@/lib/events.functions";
import { formatCompact, formatFull } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cup")({
  head: () => ({
    meta: [
      { title: "كأس التطبيق — صوتك" },
      { name: "description", content: "لوحة كأس صوتك: الداعمون والمستلمون والشاحنون ومكاسب الألعاب بأرقام حقيقية." },
      { property: "og:title", content: "كأس التطبيق — صوتك" },
      { property: "og:description", content: "ترتيب وإحصائيات يومية وأسبوعية وشهرية من عمليات صوتك الفعلية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CupPage,
});

const PERIODS = [
  ["day", "يوم"],
  ["week", "أسبوع"],
  ["month", "شهر"],
] as const;

const SECTIONS = [
  ["overview", "نظرة عامة", BarChart3],
  ["supporters", "داعمو الغرف", Users],
  ["receivers", "المستلمون", Gift],
  ["topups", "الشاحنون", Coins],
  ["game_wins", "مكاسب اللعبة", Gamepad2],
  ["rooms", "الغرف", Trophy],
] as const;

const MEDALS = ["🥇", "🥈", "🥉"];

type Period = (typeof PERIODS)[number][0];
type Section = (typeof SECTIONS)[number][0];

function CupPage() {
  const [period, setPeriod] = useState<Period>("day");
  const [section, setSection] = useState<Section>("overview");

  const stats = useQuery({
    queryKey: ["break-app-stats", period],
    queryFn: () => getBreakAppStats({ data: { period } }),
    staleTime: 60_000,
  });

  const category = section === "overview" ? "supporters" : section;
  const board = useQuery({
    queryKey: ["app-cup", category, period],
    queryFn: () => getAppCupLeaderboard({ data: { category, period } }),
    staleTime: 60_000,
  });

  return (
    <AppShell header={<PageHeader title="كأس التطبيق" subtitle="أرقام حقيقية محسوبة من عمليات التطبيق" />}>
      <div className="mb-3 flex gap-2">
        {PERIODS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={cn(
              "flex-1 rounded-2xl border py-2 text-[11px] font-bold",
              period === key ? "border-primary/60 gradient-gold text-primary-foreground" : "border-border bg-surface text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {SECTIONS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-2xl border px-3 py-2 text-[11px] font-bold",
              section === key ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <div className="mb-4">
          {stats.isLoading ? (
            <div className="grid h-24 place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Stat label="إجمالي الدعم" value={stats.data?.gifts.total_value ?? 0} />
              <Stat label="عدد الهدايا" value={stats.data?.gifts.count ?? 0} />
              <Stat label="مكاسب اللعبة (صافي)" value={stats.data?.games.net ?? 0} />
              <Stat label="إجمالي الرهانات" value={stats.data?.games.bets ?? 0} />
              <Stat label="إجمالي الجوائز" value={stats.data?.games.payouts ?? 0} />
              <Stat label="عدد الجولات" value={stats.data?.games.rounds ?? 0} />
              <Stat label="أكبر رهان" value={stats.data?.games.max_bet ?? 0} />
              <Stat label="أكبر جائزة" value={stats.data?.games.max_payout ?? 0} />
              <Stat label="إجمالي الشحن" value={stats.data?.topups.coins ?? 0} />
              <Stat label="عمليات الشحن" value={stats.data?.topups.count ?? 0} />
            </div>
          )}
        </div>
      )}

      <p className="mb-2 text-xs font-black">
        {section === "overview" ? "أعلى الداعمين" : SECTIONS.find(([key]) => key === section)?.[1]}
      </p>
      {board.isLoading ? (
        <div className="grid h-28 place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (board.data?.length ?? 0) === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">لا توجد عمليات مؤكدة في هذه الفترة بعد.</p>
      ) : (
        <ol className="space-y-2">
          {(board.data ?? []).map((entry: CupEntry, i) => (
            <li
              key={entry.entity_id}
              className={cn(
                "flex items-center gap-2 rounded-2xl border p-2.5",
                i < 3 ? "border-amber-400/40 bg-amber-400/5" : "border-border bg-surface",
              )}
            >
              <span className="w-7 text-center text-sm font-black">{MEDALS[i] ?? i + 1}</span>
              <UserAvatar src={entry.avatar_url ?? entry.image_url} name={entry.display_name} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold">{entry.display_name}</p>
                <p className="text-[9px] text-muted-foreground">ID: {entry.public_id}</p>
              </div>
              <b className="text-[11px] text-amber-400" title={`${formatFull(entry.score)} كوينز`}>
                {formatCompact(entry.score)}
              </b>
            </li>
          ))}
        </ol>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3" title={`${formatFull(value)}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-black text-primary">{formatCompact(value)}</p>
    </div>
  );
}
