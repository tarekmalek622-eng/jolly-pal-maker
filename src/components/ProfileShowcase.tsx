import { useQuery } from "@tanstack/react-query";
import { Award, Crown, Gem, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GiftThumb, type GiftMediaRow } from "@/components/GiftMedia";
import { AdminBadgeCrest } from "@/components/AdminBadgeCrest";

type Role = "super_admin" | "admin" | "moderator" | "host" | "user";

type BadgeRow = {
  id: string;
  progress: number;
  awarded_at: string;
  badge_definitions: {
    key: string;
    name: string;
    description: string | null;
    kind: string;
    threshold: number;
    sort_order: number;
    style_key: string;
    image_url: string | null;
    color_key: string;
    display_variant: string;
  } | null;
};

type GiftTotalRow = {
  gift_id: string;
  quantity: number;
  total_value: number;
  gifts: GiftMediaRow | null;
};

const ROLE_BADGES: Partial<Record<Role, { label: string; note: string; styleKey: string }>> = {
  super_admin: { label: "سوبر أدمن", note: "مالك التطبيق", styleKey: "imperial" },
  admin: { label: "مدير التطبيق", note: "إدارة موثقة", styleKey: "royal" },
  moderator: { label: "مساعد سوبر أدمن", note: "مشرف موثّق", styleKey: "crimson" },
  host: { label: "مضيف", note: "مضيف غرف موثّق", styleKey: "emerald" },
};

function BadgeMark({ name, role }: { name: string; role?: boolean }) {
  return (
    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/35 bg-primary/10 text-primary shadow-glow">
      {role ? <ShieldCheck className="h-6 w-6" /> : <Award className="h-6 w-6" />}
      <Sparkles className="absolute -end-1 -top-1 h-3 w-3 text-accent" aria-hidden="true" />
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function ProfileShowcase({ userId, own = false }: { userId: string; own?: boolean }) {
  const roles = useQuery({
    queryKey: ["profile-role-badges", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((row) => row.role as Role);
    },
  });

  const badges = useQuery({
    queryKey: ["profile-earned-badges", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_badges")
        .select("id, progress, awarded_at, badge_definitions(key, name, description, kind, threshold, sort_order, style_key, image_url, color_key, display_variant)")
        .eq("user_id", userId)
        .order("awarded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BadgeRow[];
    },
  });

  const ownedRoom = useQuery({
    queryKey: ["profile-owned-room", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, room_code")
        .eq("owner_id", userId)
        .eq("is_active", true)
        .limit(1);
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });

  const gifts = useQuery({
    queryKey: ["profile-received-gifts", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_gift_totals")
        .select("gift_id, quantity, total_value, gifts(id, name, image_url, animation_url, video_url, thumb_url, sound_url, sound_enabled, duration_ms, display_scale, rarity)")
        .eq("user_id", userId)
        .order("total_value", { ascending: false })
        .limit(18);
      if (error) throw error;
      return (data ?? []) as unknown as GiftTotalRow[];
    },
  });

  const roleBadges = Array.from(new Set(roles.data ?? []))
    .map((role) => {
      const def = ROLE_BADGES[role];
      return def ? { ...def, roleKey: role } : null;
    })
    .filter((role): role is { label: string; note: string; styleKey: string; roleKey: Role } => Boolean(role));
  const earned = (badges.data ?? []).filter((badge) => badge.badge_definitions);
  const administrative = earned.filter((badge) => badge.badge_definitions?.kind === "administrative");
  const achievements = earned.filter((badge) => badge.badge_definitions?.kind !== "administrative");
  const received = (gifts.data ?? []).filter((gift) => gift.gifts);

  return (
    <div className="mt-4 space-y-4">
      <section className="surface-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Crown className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold">{own ? "شاراتي" : "الشارات"}</h2>
              <p className="text-[10px] text-muted-foreground">أدوار موثّقة وإنجازات الهدايا</p>
            </div>
          </div>
          <span className="rounded-full bg-surface-2 px-2 py-1 text-[10px] font-bold">
            {roleBadges.length + earned.length + (ownedRoom.data ? 1 : 0)}
          </span>
        </div>

        {roles.isLoading || badges.isLoading ? (
          <div className="mt-3 h-16 animate-pulse rounded-2xl bg-surface-2" />
        ) : roleBadges.length + earned.length === 0 && !ownedRoom.data ? (
          <p className="mt-3 rounded-2xl bg-surface-2 px-3 py-4 text-center text-xs text-muted-foreground">
            {own ? "أرسل الهدايا لفتح شارات جديدة." : "لم يفتح شارات بعد."}
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {ownedRoom.data && (
              <div className="flex min-h-28 items-center justify-center rounded-2xl border border-primary/25 bg-primary/5 p-2">
                <AdminBadgeCrest name={`مالك غرفة · ${ownedRoom.data.name}`} styleKey="royal" compact />
              </div>
            )}
            {roleBadges.map((role) => (
              <div key={`${role.label}-${role.note}`} className="flex min-h-28 items-center justify-center rounded-2xl border border-primary/25 bg-primary/5 p-2">
                <AdminBadgeCrest name={`${role.label} · ${role.note}`} styleKey={role.styleKey} compact />
              </div>
            ))}
            {administrative.map((badge) => {
              const definition = badge.badge_definitions;
              if (!definition) return null;
              return (
                <div key={badge.id} className="flex min-h-28 items-center justify-center rounded-2xl border border-primary/25 bg-surface-2 p-2">
                   <AdminBadgeCrest name={definition.name} styleKey={definition.color_key || definition.style_key} imageUrl={definition.image_url} variant={definition.display_variant} compact />
                </div>
              );
            })}
            {achievements.map((badge) => {
              const definition = badge.badge_definitions;
              if (!definition) return null;
              return (
                <div key={badge.id} className="flex min-w-0 items-center gap-2 rounded-2xl bg-surface-2 p-2">
                   {definition.image_url ? <img src={definition.image_url} alt="" className="h-12 w-12 shrink-0 object-contain" loading="lazy" /> : <BadgeMark name={definition.name} />}
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold">{definition.name}</span>
                    <span className="block truncate text-[9px] text-muted-foreground">
                      {definition.threshold.toLocaleString("en-US")} كوينز
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="surface-card p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Gem className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold">الهدايا المستلمة</h2>
            <p className="text-[10px] text-muted-foreground">الأنواع والكميات المسجلة فعليًا</p>
          </div>
        </div>

        {gifts.isLoading ? (
          <div className="mt-3 h-20 animate-pulse rounded-2xl bg-surface-2" />
        ) : received.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-surface-2 px-3 py-4 text-center text-xs text-muted-foreground">
            لا توجد هدايا مستلمة بعد.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {received.map((row) => {
              const gift = row.gifts;
              if (!gift) return null;
              return (
                <div key={row.gift_id} className="min-w-0 text-center">
                  <div className="relative mx-auto flex aspect-square w-full items-center justify-center rounded-2xl bg-surface-2 p-1">
                    <GiftThumb gift={gift} size={54} className="max-h-full max-w-full" />
                    <span className="absolute -bottom-1 -end-1 rounded-full border border-background bg-primary px-1.5 py-0.5 text-[9px] font-black text-primary-foreground">
                      ×{row.quantity.toLocaleString("en-US")}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[9px] font-semibold">{gift.name}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}