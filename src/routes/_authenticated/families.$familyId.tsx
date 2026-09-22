import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Crown, Loader2, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { FamilyCrest } from "@/components/FamilyCrest";
import { UserAvatar } from "@/components/UserAvatar";
import { FAMILY_ROLE_LABEL, familyStyle } from "@/lib/family-art";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSupabaseSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/families/$familyId")({
  head: () => ({
    meta: [
      { title: "بروفايل العائلة — التاج" },
      {
        name: "description",
        content: "بروفايل العائلة: المستوى، النقاط، الإحصائيات، القائد والنواب والأعضاء.",
      },
      { property: "og:title", content: "بروفايل العائلة — التاج" },
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
    cover_url: string | null;
    animation_url: string | null;
    join_mode: "open" | "request" | "closed";
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
    permissions?: Record<string, boolean>;
  }[];
  leader: {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    public_id: string;
    vip_level: number;
  } | null;
  viewer: {
    role: string;
    can_accept_members: boolean;
    can_remove_members: boolean;
    can_manage_requests: boolean;
    can_manage_profile: boolean;
    can_manage_moderators: boolean;
  } | null;
  join_request_status: string | null;
};

function FamilyPage() {
  const { familyId } = Route.useParams();
  const { userId } = useSupabaseSession();

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

  const join = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("family_request_join", { _family_id: familyId });
      if (error) throw new Error(error.message);
      return data as { status?: string };
    },
    onSuccess: (data) => {
      toast.success(data?.status === "joined" ? "تم الانضمام للعائلة" : "تم إرسال طلب الانضمام");
      void stats.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إرسال الطلب"),
  });

  const canReview = Boolean(
    stats.data?.viewer?.can_manage_requests || stats.data?.viewer?.can_accept_members,
  );
  const requests = useQuery({
    queryKey: ["family-join-requests", familyId],
    enabled: canReview,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("family_join_requests")
        .select("id, user_id, created_at")
        .eq("family_id", familyId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      const ids = (rows ?? []).map((row) => row.user_id);
      if (ids.length === 0) return [];
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, public_id, vip_level")
        .in("id", ids);
      if (profileError) throw new Error(profileError.message);
      const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      return (rows ?? []).map((row) => ({ ...row, profile: byId.get(row.user_id) ?? null }));
    },
  });

  const reviewRequest = useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean }) => {
      const { error } = await supabase.rpc("family_respond_join_request", {
        _request_id: requestId,
        _accept: accept,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم تحديث طلب الانضمام");
      void requests.refetch();
      void stats.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تحديث الطلب"),
  });

  const manageMember = useMutation({
    mutationFn: async ({
      memberId,
      action,
    }: {
      memberId: string;
      action: "remove" | "promote" | "demote";
    }) => {
      const { error } = await supabase.rpc("family_manage_member", {
        _family_id: familyId,
        _member_id: memberId,
        _action: action,
        _permissions:
          action === "promote"
            ? {
                family_accept_members: true,
                family_manage_requests: true,
                family_remove_members: false,
                family_manage_profile: false,
                family_manage_moderators: false,
              }
            : {},
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم تحديث عضو العائلة");
      void stats.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تحديث العضو"),
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
  const progress =
    next && next > base
      ? Math.min(100, Math.round(((s.family.points - base) / (next - base)) * 100))
      : 100;
  return (
    <AppShell header={<PageHeader title={s.family.name} subtitle={`ID ${s.family.family_code}`} />}>
      <div className="space-y-3 px-4 pb-8">
        <div
          className={cn(
            "surface-card space-y-3 bg-gradient-to-br p-4",
            style.card,
            s.family.level >= 7 && style.glow,
          )}
        >
          {(s.family.animation_url || s.family.cover_url) && (
            <img
              src={s.family.animation_url || s.family.cover_url || ""}
              alt={`غلاف ${s.family.name}`}
              className="cover-sheen h-36 w-full rounded-2xl object-cover"
            />
          )}
          <div className="flex items-center gap-3">
            <FamilyCrest
              name={s.family.name}
              logoUrl={s.family.logo_url}
              styleKey={s.level_info?.style}
              level={s.family.level}
              size={64}
              className={cn("crest-3d", style.ring)}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-black">{s.family.name}</p>
              <span
                className={cn(
                  "mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
                  style.badge,
                )}
              >
                {s.family.level >= 7 && <Crown className="h-3 w-3" />}
                {s.level_info?.name ?? `مستوى ${s.family.level}`} · مستوى {s.family.level}
              </span>
            </div>
            {s.family.is_suspended && (
              <span className="rounded-full border border-destructive/50 px-2 py-0.5 text-[10px] font-bold text-destructive">
                موقوفة
              </span>
            )}
          </div>

          {s.family.description && (
            <p className="text-[11px] text-muted-foreground">{s.family.description}</p>
          )}

          {!s.viewer && userId && (
            <Button
              disabled={
                join.isPending ||
                s.family.is_suspended ||
                s.family.join_mode === "closed" ||
                s.join_request_status === "pending"
              }
              onClick={() => join.mutate()}
              className="h-10 w-full rounded-xl gradient-gold text-xs font-bold text-primary-foreground"
            >
              {join.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : s.join_request_status === "pending" ? (
                "طلب الانضمام قيد المراجعة"
              ) : s.family.join_mode === "closed" ? (
                "الانضمام مغلق"
              ) : s.family.join_mode === "open" ? (
                "انضم الآن"
              ) : (
                "إرسال طلب انضمام"
              )}
            </Button>
          )}

          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-black/25">
              <div
                className="h-full rounded-full gradient-gold"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{formatCoins(s.family.points)} نقطة</span>
              <span>
                {next
                  ? `المتبقي للمستوى القادم: ${formatCoins(next - s.family.points)}`
                  : "أعلى مستوى"}
              </span>
            </div>
          </div>
        </div>

        {s.leader && (
          <Link
            to="/u/$publicId"
            params={{ publicId: s.leader.public_id }}
            className="surface-card flex items-center gap-3 p-3"
          >
            <UserAvatar
              src={s.leader.avatar_url}
              name={s.leader.display_name}
              size={46}
              vipLevel={s.leader.vip_level}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-primary">قائد العائلة</p>
              <p className="truncate text-sm font-black">{s.leader.display_name}</p>
              <p className="text-[10px] text-muted-foreground">ID {s.leader.public_id}</p>
            </div>
            <Crown className="h-5 w-5 text-primary" />
          </Link>
        )}

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

        {canReview && (
          <div className="surface-card space-y-2 p-3">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <ShieldCheck className="h-4 w-4" /> طلبات الانضمام
            </p>
            {requests.isLoading && (
              <p className="text-[10px] text-muted-foreground">جارٍ تحميل الطلبات…</p>
            )}
            {requests.data?.length === 0 && (
              <p className="text-[10px] text-muted-foreground">لا توجد طلبات معلقة.</p>
            )}
            {(requests.data ?? []).map((request) => (
              <div
                key={request.id}
                className="flex items-center gap-2 rounded-xl border border-border/50 p-2"
              >
                <UserAvatar
                  src={request.profile?.avatar_url}
                  name={request.profile?.display_name}
                  size={34}
                  vipLevel={request.profile?.vip_level ?? 0}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold">
                    {request.profile?.display_name ?? "مستخدم"}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    ID {request.profile?.public_id ?? "—"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="قبول"
                  disabled={reviewRequest.isPending}
                  onClick={() => reviewRequest.mutate({ requestId: request.id, accept: true })}
                  className="rounded-lg bg-success/15 p-2 text-success"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="رفض"
                  disabled={reviewRequest.isPending}
                  onClick={() => reviewRequest.mutate({ requestId: request.id, accept: false })}
                  className="rounded-lg bg-destructive/15 p-2 text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="surface-card space-y-2 p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Users className="h-4 w-4" /> الأعضاء
          </p>
          {s.top_members.length === 0 && (
            <p className="text-[10px] text-muted-foreground">لا يوجد أعضاء بعد.</p>
          )}
          {s.top_members.map((m) => (
            <Link
              key={m.user_id}
              to="/u/$publicId"
              params={{ publicId: m.public_id }}
              className="flex items-center gap-2 rounded-xl border border-border/50 p-2"
            >
              <UserAvatar
                src={m.avatar_url}
                name={m.display_name}
                size={34}
                vipLevel={m.vip_level}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold">{m.display_name}</p>
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {m.role === "leader" && <Crown className="h-3 w-3 text-primary" />}
                  {m.role === "deputy" && <ShieldCheck className="h-3 w-3 text-primary" />}
                  {FAMILY_ROLE_LABEL[m.role] ?? m.role} · {formatCoins(m.points)}
                </p>
              </div>
              {m.role !== "leader" && s.viewer?.can_manage_moderators && (
                <button
                  type="button"
                  disabled={manageMember.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    manageMember.mutate({
                      memberId: m.user_id,
                      action: m.role === "deputy" ? "demote" : "promote",
                    });
                  }}
                  className="rounded-lg border border-primary/35 px-2 py-1 text-[9px] font-bold text-primary"
                >
                  {m.role === "deputy" ? "إرجاع عضو" : "تعيين مشرف"}
                </button>
              )}
              {m.role !== "leader" && s.viewer?.can_remove_members && (
                <button
                  type="button"
                  aria-label="إزالة العضو"
                  disabled={manageMember.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    manageMember.mutate({ memberId: m.user_id, action: "remove" });
                  }}
                  className="rounded-lg border border-destructive/35 p-1.5 text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
