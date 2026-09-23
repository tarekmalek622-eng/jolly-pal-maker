import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { WinBurst } from "@/components/effects/WinBurst";
import { useSupabaseSession } from "@/hooks/use-session";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

const BOXES = [
  { tier: "bronze", label: "صندوق برونزي", cost: 10000, emoji: "🥉" },
  { tier: "silver", label: "صندوق فضي", cost: 50000, emoji: "🥈" },
  { tier: "gold", label: "صندوق ذهبي", cost: 200000, emoji: "🥇" },
];

export const Route = createFileRoute("/_authenticated/boxes")({
  head: () => ({
    meta: [
      { title: "صناديق الهدايا — التاج" },
      {
        name: "description",
        content: "افتح صناديق هدايا عشوائية بفئات نادرة واحصل على مكافآت كوينز داخل تطبيق التاج.",
      },
      { property: "og:title", content: "صناديق الهدايا — التاج" },
      { property: "og:description", content: "صناديق برونزية وفضية وذهبية بجوائز نادرة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BoxesPage,
});

function BoxesPage() {
  const { userId } = useSupabaseSession();
  const [burst, setBurst] = useState(false);
  const [result, setResult] = useState<{ reward: number; cost: number; rarity: string } | null>(
    null,
  );

  const history = useQuery({
    queryKey: ["box-history", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db
        .from("gift_box_opens")
        .select("id, tier, cost, reward, rarity, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });

  const open = useMutation({
    mutationFn: async (tier: string) => {
      const { data, error } = await db.rpc("open_gift_box", { _tier: tier });
      if (error) throw new Error(error.message);
      return data as { reward: number; cost: number; rarity: string };
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.reward > data.cost) {
        setBurst(true);
        window.setTimeout(() => setBurst(false), 2600);
      }
      void history.refetch();
    },
    onError: (error: Error) => toast.error(error.message || "تعذر فتح الصندوق"),
  });

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <Link to="/tasks" className="p-1">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <p className="flex-1 text-sm font-bold">صناديق الهدايا</p>
        </header>
      }
    >
      <WinBurst active={burst} />
      <div className="space-y-3 pb-24">
        <p className="text-[11px] text-muted-foreground">
          كل صندوق يمنح جائزة عشوائية من الخادم: عادي، جيد، نادر، أو أسطوري.
        </p>
        {BOXES.map((box) => (
          <section key={box.tier} className="surface-card flex items-center gap-3 p-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface text-3xl">
              {box.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{box.label}</p>
              <p className="text-[11px] text-muted-foreground">
                السعر: {formatCoins(box.cost)} كوينز
              </p>
            </div>
            <Button
              disabled={open.isPending}
              onClick={() => open.mutate(box.tier)}
              className="h-10 rounded-2xl gradient-gold text-xs font-bold text-primary-foreground"
            >
              <Sparkles className="me-1 h-4 w-4" />
              افتح
            </Button>
          </section>
        ))}

        {result && (
          <section
            className={cn(
              "surface-card space-y-1 p-4 text-center",
              result.reward > result.cost && "border border-primary/50",
            )}
          >
            <p className="text-xs font-bold text-primary">الجائزة: {result.rarity}</p>
            <p className="text-lg font-black">{formatCoins(result.reward)}</p>
            <p className="text-[11px] text-muted-foreground">
              {result.reward > result.cost
                ? `ربحت ${formatCoins(result.reward - result.cost)}`
                : `خسرت ${formatCoins(result.cost - result.reward)}`}
            </p>
          </section>
        )}

        <section className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground">آخر الفتحات</p>
          {(history.data ?? []).length === 0 ? (
            <EmptyState title="لا توجد فتحات بعد" description="افتح أول صندوق وشاهد جائزتك هنا" />
          ) : (
            (history.data ?? []).map((row) => (
              <div key={row.id} className="flex items-center gap-2 rounded-xl bg-surface p-2">
                <p className="flex-1 text-[11px] font-bold">{row.rarity}</p>
                <p className="text-[11px] text-muted-foreground">{formatCoins(row.cost)} →</p>
                <p className="text-[11px] font-bold text-primary">{formatCoins(row.reward)}</p>
              </div>
            ))
          )}
        </section>
      </div>
    </AppShell>
  );
}
