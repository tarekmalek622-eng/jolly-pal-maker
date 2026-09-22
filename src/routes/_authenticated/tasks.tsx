import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Gift, Trophy, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { useSupabaseSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

type TaskRow = {
  key: string;
  title: string;
  description: string;
  period: "daily" | "weekly";
  target: number;
  reward: number;
  progress: number;
  claimed: boolean;
};

type PayoutRow = {
  id: string;
  category: string;
  rank: number;
  score: number;
  coins: number;
  user_id: string;
  week_start: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  gifter: "أكثر إهداءً",
  receiver: "أكثر استلامًا",
  recharge: "أكثر شحنًا",
};

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "المهام والجوائز — التاج" },
      {
        name: "description",
        content: "مهام يومية وأسبوعية بمكافآت كوينز، دعوة الأصدقاء، وترتيب الأسبوع في تطبيق التاج.",
      },
      { property: "og:title", content: "المهام والجوائز — التاج" },
      { property: "og:description", content: "أكمل مهامك اليومية واستلم مكافآتك وتابع ترتيب الأسبوع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { userId } = useSupabaseSession();
  const [code, setCode] = useState("");

  const me = useQuery({
    queryKey: ["tasks-me", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("public_id, display_name")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const tasks = useQuery<TaskRow[]>({
    queryKey: ["tasks-state", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db.rpc("tasks_state");
      if (error) throw new Error(error.message);
      return (data ?? []) as TaskRow[];
    },
    staleTime: 30_000,
  });

  const invites = useQuery({
    queryKey: ["my-referrals", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db
        .from("referrals")
        .select("id, invitee_id, coins_inviter, created_at")
        .eq("inviter_id", userId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; invitee_id: string; coins_inviter: number; created_at: string }[];
    },
  });

  const ranking = useQuery<PayoutRow[]>({
    queryKey: ["weekly-rank-payouts"],
    queryFn: async () => {
      const { data, error } = await db
        .from("weekly_rank_payouts")
        .select("id, category, rank, score, coins, user_id, week_start")
        .order("week_start", { ascending: false })
        .order("rank", { ascending: true })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as PayoutRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const winnerIds = Array.from(new Set((ranking.data ?? []).map((r) => r.user_id)));
  const winners = useQuery({
    queryKey: ["weekly-rank-profiles", winnerIds.join(",")],
    enabled: winnerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, public_id, vip_level")
        .in("id", winnerIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const claim = useMutation({
    mutationFn: async (key: string) => {
      const { error } = await db.rpc("task_claim", { _key: key });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم استلام المكافأة");
      void tasks.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const redeem = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("referral_redeem", { _code: code.trim() });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم تفعيل رمز الدعوة واستلام المكافأة");
      setCode("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const daily = (tasks.data ?? []).filter((t) => t.period === "daily");
  const weekly = (tasks.data ?? []).filter((t) => t.period === "weekly");

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <Link to="/me" className="p-1" aria-label="رجوع">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-bold">المهام والجوائز</h1>
        </header>
      }
    >
      <div className="space-y-5 pb-28">
        {tasks.isLoading && <p className="py-10 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>}
        {tasks.isError && (
          <div className="surface-card p-4 text-center text-sm">
            <p className="mb-2">تعذر تحميل المهام</p>
            <Button onClick={() => void tasks.refetch()} className="h-9">
              إعادة المحاولة
            </Button>
          </div>
        )}

        <TaskGroup title="مهام يومية" rows={daily} onClaim={(k) => claim.mutate(k)} busy={claim.isPending} />
        <TaskGroup title="مهام أسبوعية" rows={weekly} onClaim={(k) => claim.mutate(k)} busy={claim.isPending} />

        <section className="surface-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">دعوة الأصدقاء</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            شارك رمزك مع أصدقائك — يستلم صديقك 100,000 وتستلم أنت 200,000 عند تفعيله.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="flex-1 rounded-2xl bg-surface px-3 py-2.5 text-center text-sm font-bold tracking-widest">
              {me.data?.public_id ?? "..."}
            </span>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                void navigator.clipboard?.writeText(me.data?.public_id ?? "");
                toast.success("تم نسخ الرمز");
              }}
            >
              نسخ
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="أدخل رمز من دعاك"
              className="h-11 flex-1 rounded-2xl bg-surface"
            />
            <Button
              className="h-11 gradient-gold text-primary-foreground"
              disabled={redeem.isPending || code.trim().length < 1}
              onClick={() => redeem.mutate()}
            >
              تفعيل
            </Button>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            دعواتك المفعّلة: {(invites.data ?? []).length.toLocaleString("en-US")}
          </p>
        </section>

        <section className="surface-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">ترتيب الأسبوع والجوائز</h2>
          </div>
          {(ranking.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              لم تُعلَن نتائج أسبوعية بعد — تُصرف الجوائز تلقائيًا كل اثنين.
            </p>
          ) : (
            <div className="space-y-2">
              {(ranking.data ?? []).map((row) => {
                const p = (winners.data ?? []).find((w) => w.id === row.user_id);
                return (
                  <div key={row.id} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2">
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold",
                        row.rank === 1 ? "gradient-gold text-primary-foreground" : "bg-background",
                      )}
                    >
                      {row.rank}
                    </span>
                    <UserAvatar src={p?.avatar_url} name={p?.display_name} size={32} vipLevel={p?.vip_level ?? 0} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{p?.display_name ?? "مستخدم"}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {CATEGORY_LABELS[row.category] ?? row.category} · {row.week_start}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-primary">
                      +{row.coins.toLocaleString("en-US")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function TaskGroup({
  title,
  rows,
  onClaim,
  busy,
}: {
  title: string;
  rows: TaskRow[];
  onClaim: (key: string) => void;
  busy: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-bold">{title}</h2>
      {rows.map((t) => {
        const pct = Math.min(100, Math.round((Number(t.progress) / Math.max(1, Number(t.target))) * 100));
        const done = Number(t.progress) >= Number(t.target);
        return (
          <div key={t.key} className="surface-card flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
              {t.claimed ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <Gift className="h-5 w-5 text-primary" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{t.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">{t.description}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                <div className="h-full gradient-gold" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {Number(t.progress).toLocaleString("en-US")} / {Number(t.target).toLocaleString("en-US")} ·
                مكافأة {Number(t.reward).toLocaleString("en-US")}
              </p>
            </div>
            <Button
              className={cn("h-9 shrink-0 text-xs", done && !t.claimed && "gradient-gold text-primary-foreground")}
              variant={done && !t.claimed ? "default" : "outline"}
              disabled={t.claimed || !done || busy}
              onClick={() => onClaim(t.key)}
            >
              {t.claimed ? "مستلمة" : done ? "استلام" : "قيد التنفيذ"}
            </Button>
          </div>
        );
      })}
    </section>
  );
}
