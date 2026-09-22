import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useSupabaseSession } from "@/hooks/use-session";
import { formatCompact } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/my-stats")({
  head: () => ({
    meta: [
      { title: "إحصائياتي — التاج" },
      { name: "description", content: "مستواك، هداياك، غرفك، وزوّار ملفك في مكان واحد." },
      { property: "og:title", content: "إحصائياتي — التاج" },
      { property: "og:description", content: "ملخص نشاطك داخل التاج." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyStatsPage,
});

function MyStatsPage() {
  const { userId } = useSupabaseSession();

  const stats = useQuery({
    queryKey: ["my-stats", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [profile, wallet, sent, received, visits, friends] = await Promise.all([
        supabase.from("profiles").select("level, xp, vip_level, cvip_level").eq("id", userId!).maybeSingle(),
        supabase.from("coin_wallets").select("balance, recharge_points").eq("user_id", userId!).maybeSingle(),
        supabase.from("gift_transactions").select("total_price").eq("sender_id", userId!).limit(1000),
        supabase.from("gift_transactions").select("total_price").eq("receiver_id", userId!).limit(1000),
        supabase.from("profile_visits").select("id", { count: "exact", head: true }).eq("profile_id", userId!),
        supabase.from("friends").select("id", { count: "exact", head: true }).eq("user_id", userId!),
      ]);
      const sum = (rows: { total_price: number }[] | null) =>
        (rows ?? []).reduce((a, r) => a + Number(r.total_price ?? 0), 0);
      return {
        level: profile.data?.level ?? 1,
        xp: Number(profile.data?.xp ?? 0),
        vip: profile.data?.vip_level ?? 0,
        cvip: profile.data?.cvip_level ?? 0,
        balance: Number(wallet.data?.balance ?? 0),
        points: Number(wallet.data?.recharge_points ?? 0),
        sent: sum(sent.data as { total_price: number }[] | null),
        received: sum(received.data as { total_price: number }[] | null),
        visits: visits.count ?? 0,
        friends: friends.count ?? 0,
      };
    },
  });

  const items = stats.data
    ? [
        { label: "المستوى", value: String(stats.data.level) },
        { label: "نقاط الخبرة", value: formatCompact(stats.data.xp) },
        { label: "VIP", value: stats.data.vip ? `مستوى ${stats.data.vip}` : "لا يوجد" },
        { label: "SVIP", value: stats.data.cvip ? `مستوى ${stats.data.cvip}` : "لا يوجد" },
        { label: "رصيد الماس", value: formatCompact(stats.data.balance) },
        { label: "نقاط الشحن", value: formatCompact(stats.data.points) },
        { label: "هدايا أرسلتها", value: formatCompact(stats.data.sent) },
        { label: "هدايا استلمتها", value: formatCompact(stats.data.received) },
        { label: "زوّار ملفك", value: String(stats.data.visits) },
        { label: "الأصدقاء", value: String(stats.data.friends) },
      ]
    : [];

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <Link to="/me" className="p-1" aria-label="رجوع">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-black">إحصائياتي</h1>
        </header>
      }
    >
      <div className="px-4 pb-10">
        {stats.isLoading && (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
        {stats.isError && (
          <div className="surface-card mt-4 p-4 text-center">
            <p className="text-sm font-bold">تعذر تحميل الإحصائيات</p>
            <button
              type="button"
              onClick={() => void stats.refetch()}
              className="mt-2 rounded-2xl bg-primary/15 px-4 py-2 text-xs font-bold text-primary"
            >
              إعادة المحاولة
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {items.map((i) => (
            <div key={i.label} className="surface-card p-4">
              <p className="text-[11px] text-muted-foreground">{i.label}</p>
              <p className="mt-1 text-base font-black text-primary">{i.value}</p>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
