import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { FamilyCrest } from "@/components/FamilyCrest";
import { UserAvatar } from "@/components/UserAvatar";
import { FAMILY_ROLE_LABEL, familyStyle } from "@/lib/family-art";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/families/$familyId")({
  head: () => ({
    meta: [
      { title: "بروفايل العائلة — صوتك" },
      { name: "description", content: "بروفايل العائلة: المستوى، النقاط، الإحصائيات، القائد والنواب والأعضاء." },
      { property: "og:title", content: "بروفايل العائلة — صوتك" },
      { property: "og:description", content: "مستوى العائلة ونقاطها وأعضاؤها وإحصائيات الهدايا." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FamilyPage,
});

type Stats = {
  family: {
    id: string;
    family_code: string;
    name: string;
    logo_url: string | null;
    description: string | null;
    level: number;
    points: number;
    member_count: number;
    max_members: number;
    is_suspended: boolean;
  };
  level_info: { level: number; name: string; points: number; style: string } | null;
  next_level: { level: number; name: string; points: number } | null;
  members: number;
  gifts_received: number;
  gifts_sent: number;
  top_members: {
    user_id: string;
    role: string;
    points: number;
    display_name: string;
    avatar_url: string | null;
    public_id: string;
    vip_level: number;
  }[];
};

function FamilyPage() {
  const { familyId } = Route.useParams();

  const stats = useQuery({
    queryKey: ["family-stats", familyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("family_stats", { _family_id: familyId });
      if (error) throw new Error(error.message);
      return data as unknown as Stats | null;
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  if (stats.isLoading) {
    return (
      <AppShell header={<PageHeader title="العائلة" />}>
        <div className="px-4">
          <div className="surface-card p-4 text-xs text-muted-foreground">جارٍ التحميل…</div>
        </div>
      </AppShell>
    );
  }

  const s = stats.data;
  if (!s) {
    return (
      <AppShell header={<PageHeader title="العائلة" />}>
        <div className="px-4">
          <EmptyState title="العائلة غير موجودة" hint="قد تكون محذوفة أو موقوفة." />
        </div>
      </AppShell>
    );
  }

  const style = familyStyle(s.level_info?.style);
  const base = s.level_info?.points ?? 0;
  const next = s.next_level?.points ?? null;
  const progress = next && next > base ? Math.min(100, Math.round(((s.family.points - base) / (next - base)) * 100)) : 100;

  return (
    <AppShell header={<PageHeader title={s.family.name} subtitle={`ID ${s.family.family_code}`} />}>
      <div className="space-y-3 px-4 pb-8">
        <div className={cn("surface-card space-y-3 bg-gradient-to-br p-4", style.card, s.family.level >= 7 && style.glow)}>
          <div className="flex items-center gap-3">
            <FamilyCrest name={s.family.name} logoUrl={s.family.logo_url} styleKey={s.level_info?.style} level={s.family.level} size={64} className={style.ring} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-black">{s.family.name}</p>
              <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold", style.badge)}>
                {s.family.level >= 7 && <Crown className="h-3 w-3" />}
                {s.level_info?.name ?? `مستوى ${s.family.level}`} · مستوى {s.family.level}
              </span>
            </div>
            {s.family.is_suspended && (
              <span className="rounded-full border border-destructive/50 px-2 py-0.5 text-[10px] font-bold text-destructive">موقوفة</span>
            )}
          </div>

          {s.family.description && <p className="text-[11px] text-muted-foreground">{s.family.description}</p>}

          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-black/25">
              <div className="h-full rounded-full gradient-gold" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{formatCoins(s.family.points)} نقطة</span>
              <span>{next ? `المتبقي للمستوى القادم: ${formatCoins(next - s.family.points)}` : "أعلى مستوى"}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "الأعضاء", value: `${s.family.member_count}/${s.family.max_members}` },
            { label: "هدايا مستلمة", value: formatCoins(s.gifts_received) },
            { label: "هدايا مُرسلة", value: formatCoins(s.gifts_sent) },
          ].map((c) => (
            <div key={c.label} className="surface-card p-3 text-center">
              <p className="text-sm font-black">{c.value}</p>
              <p className="text-[10px] text-muted-foreground">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="surface-card space-y-2 p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Users className="h-4 w-4" /> الأعضاء
          </p>
          {s.top_members.length === 0 && <p className="text-[10px] text-muted-foreground">لا يوجد أعضاء بعد.</p>}
          {s.top_members.map((m) => (
            <Link
              key={m.user_id}
              to="/u/$publicId"
              params={{ publicId: m.public_id }}
              className="flex items-center gap-2 rounded-xl border border-border/50 p-2"
            >
              <UserAvatar src={m.avatar_url} name={m.display_name} size={34} vipLevel={m.vip_level} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold">{m.display_name}</p>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {m.role === "leader" && <Crown className="h-3 w-3 text-primary" />}
                  {m.role === "deputy" && <ShieldCheck className="h-3 w-3 text-primary" />}
                  {FAMILY_ROLE_LABEL[m.role] ?? m.role} · {formatCoins(m.points)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
