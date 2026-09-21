import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { familyStyle } from "@/lib/family-art";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/families")({
  head: () => ({
    meta: [
      { title: "العائلات — صوتك" },
      { name: "description", content: "تعرّف على عائلات صوتك، مستوياتها، نقاطها وأعضائها." },
      { property: "og:title", content: "عائلات صوتك" },
      { property: "og:description", content: "ترتيب العائلات حسب النقاط والمستوى وعدد الأعضاء." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FamiliesPage,
});

type Level = { level: number; name: string; points: number; style: string };

function FamiliesPage() {
  const levels = useQuery({
    queryKey: ["family-levels"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("family_settings");
      if (error) throw new Error(error.message);
      return ((data as { levels?: Level[] } | null)?.levels ?? []) as Level[];
    },
  });

  const families = useQuery({
    queryKey: ["families-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("families")
        .select("id, family_code, name, logo_url, description, level, points, member_count, max_members, is_suspended")
        .eq("is_active", true)
        .order("points", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <AppShell header={<PageHeader title="العائلات" subtitle="ترتيب العائلات حسب نقاط الدعم" />}>
      <div className="space-y-2 px-4 pb-6">
        {families.isLoading && <div className="surface-card p-4 text-xs text-muted-foreground">جارٍ التحميل…</div>}
        {families.data?.length === 0 && <EmptyState title="لا توجد عائلات بعد" hint="إنشاء العائلات يتم من الإدارة." />}
        {(families.data ?? []).map((f, i) => {
          const lvl = levels.data?.find((l) => l.level === f.level);
          const style = familyStyle(lvl?.style);
          return (
            <Link
              key={f.id}
              to="/families/$familyId"
              params={{ familyId: f.id }}
              className={cn("surface-card flex items-center gap-3 bg-gradient-to-br p-3", style.card, f.level >= 7 && style.glow)}
            >
              <span className="w-5 text-center text-xs font-black text-muted-foreground">{i + 1}</span>
              <UserAvatar src={f.logo_url} name={f.name} size={46} className={style.ring} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{f.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  ID {f.family_code} · {lvl?.name ?? `مستوى ${f.level}`} · {formatCoins(f.points)}
                </p>
              </div>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Users className="h-3 w-3" />
                {f.member_count}/{f.max_members}
              </span>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
