import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

type Dashboard = {
  users: number;
  online: number;
  rooms_active: number;
  gifts_24h: number;
  recharge_7d: number;
  pending_topups: number;
  open_tickets: number;
  top_rooms: { id: string; name: string; member_count: number; xp: number; level: number }[];
  top_gifters: { id: string; display_name: string; public_id: string; avatar_url: string | null; total: number }[];
  recharge_daily: { day: string; coins: number }[];
};

export const Route = createFileRoute("/_authenticated/owner-stats")({
  head: () => ({
    meta: [
      { title: "إحصائيات التطبيق — التاج" },
      { name: "description", content: "لوحة إحصائيات مالك تطبيق التاج: الغرف الأنشط، أعلى المهدين، وحركة الشحن." },
      { property: "og:title", content: "إحصائيات التطبيق — التاج" },
      { property: "og:description", content: "أرقام التطبيق الحقيقية في لوحة واحدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnerStatsPage,
});

function OwnerStatsPage() {
  const stats = useQuery<Dashboard>({
    queryKey: ["owner-dashboard"],
    queryFn: async () => {
      const { data, error } = await db.rpc("owner_dashboard");
      if (error) throw new Error(error.message);
      return data as Dashboard;
    },
    refetchInterval: 60_000,
  });

  const maxDay = Math.max(1, ...(stats.data?.recharge_daily ?? []).map((d) => Number(d.coins)));

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <Link to="/me" className="p-1" aria-label="رجوع">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <BarChart3 className="h-4 w-4 text-primary" />
          <h1 className="text-base font-bold">إحصائيات التطبيق</h1>
        </header>
      }
    >
      <div className="space-y-4 pb-28">
        {stats.isLoading && <p className="py-10 text-center text-sm text-muted-foreground">جارٍ التحميل...</p>}
        {stats.isError && (
          <div className="surface-card p-4 text-center text-sm">
            <p className="mb-2">{(stats.error as Error)?.message ?? "تعذر تحميل الإحصائيات"}</p>
            <Button className="h-9" onClick={() => void stats.refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        )}

        {stats.data && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="الحسابات" value={stats.data.users} />
              <Stat label="متصل الآن" value={stats.data.online} />
              <Stat label="غرف نشطة" value={stats.data.rooms_active} />
              <Stat label="هدايا 24 ساعة" value={stats.data.gifts_24h} />
              <Stat label="شحن 7 أيام" value={stats.data.recharge_7d} />
              <Stat label="طلبات شحن معلّقة" value={stats.data.pending_topups} />
              <Stat label="شكاوى مفتوحة" value={stats.data.open_tickets} />
            </div>

            <section className="surface-card p-4">
              <h2 className="mb-3 text-sm font-bold">حركة الشحن (14 يومًا)</h2>
              <div className="flex h-28 items-end gap-1">
                {(stats.data.recharge_daily ?? []).map((d) => (
                  <div key={d.day} className="flex-1">
                    <div
                      className="w-full rounded-t gradient-gold"
                      style={{ height: `${Math.round((Number(d.coins) / maxDay) * 100)}%`, minHeight: 2 }}
                      title={`${d.day}: ${Number(d.coins).toLocaleString("en-US")}`}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="surface-card p-4">
              <h2 className="mb-3 text-sm font-bold">أكثر الغرف نشاطًا</h2>
              <div className="space-y-2">
                {(stats.data.top_rooms ?? []).map((r, i) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2 text-xs">
                    <span className="w-4 font-bold text-primary">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
                    <span className="text-muted-foreground">Lv{r.level}</span>
                    <span className="text-muted-foreground">{Number(r.xp).toLocaleString("en-US")}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="surface-card p-4">
              <h2 className="mb-3 text-sm font-bold">أعلى المهدين (7 أيام)</h2>
              <div className="space-y-2">
                {(stats.data.top_gifters ?? []).map((g, i) => (
                  <div key={g.id} className="flex items-center gap-3 rounded-2xl bg-surface px-3 py-2">
                    <span className="w-4 text-xs font-bold text-primary">{i + 1}</span>
                    <UserAvatar src={g.avatar_url} name={g.display_name} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{g.display_name}</p>
                      <p className="text-[10px] text-muted-foreground">{g.public_id}</p>
                    </div>
                    <span className="text-[11px] font-bold text-primary">
                      {Number(g.total).toLocaleString("en-US")}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-card p-3.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-black">{Number(value ?? 0).toLocaleString("en-US")}</p>
    </div>
  );
}
