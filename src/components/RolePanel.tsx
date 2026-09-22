import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Coins, Crown, Heart, Shield, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { badgeArt } from "@/lib/badge-art";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/UserAvatar";
import { VipName } from "@/components/VipName";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "مالك التطبيق",
  admin: "مدير التطبيق",
  moderator: "مساعد سوبر أدمن",
  host: "مضيف",
};

const FAMILY_ROLE_LABELS: Record<string, string> = {
  leader: "صاحب عائلة",
  owner: "صاحب عائلة",
  moderator: "مسؤول عائلة",
  admin: "مسؤول عائلة",
  member: "عضو عائلة",
};

interface RolePanelProps {
  userId?: string | null;
  isRoomOwner?: boolean;
  isRoomModerator?: boolean;
  className?: string;
  onNavigate?: () => void;
}

/** بطاقة المنصب: صورة المستخدم ومعرّفه وشرائط مناصبه وشاراته مع زر «المزيد». */
export function RolePanel({
  userId,
  isRoomOwner,
  isRoomModerator,
  className,
  onNavigate,
}: RolePanelProps) {
  const data = useQuery({
    queryKey: ["role-panel", userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const uid = userId ?? "";
      const [roles, profile, family, badges, social] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase
          .from("profiles")
          .select(
            "public_id, display_name, avatar_url, frame_url, country, gender, vip_level, cvip_level, level",
          )
          .eq("id", uid)
          .maybeSingle(),
        supabase
          .from("family_members")
          .select("role, families(name)")
          .eq("user_id", uid)
          .maybeSingle(),
        supabase
          .from("user_badges")
          .select("id, badge_definitions(key, name, style_key)")
          .eq("user_id", uid)
          .limit(12),
        supabase.from("profile_gift_totals").select("total_value").eq("user_id", uid),
      ]);
      if (roles.error) throw roles.error;
      if (profile.error) throw profile.error;
      if (badges.error) throw badges.error;
      const gifted = (social.data ?? []).reduce(
        (sum, row) => sum + Number((row as { total_value?: number }).total_value ?? 0),
        0,
      );
      return {
        roles: (roles.data ?? []).map((row) => String(row.role)),
        profile: profile.data,
        gifted,
        familyRole: family.data?.role ? String(family.data.role) : null,
        familyName:
          (family.data as { families?: { name?: string } | null } | null)?.families?.name ?? null,
        badges: (badges.data ?? [])
          .map((row) => {
            const def = (
              row as {
                badge_definitions?: { key: string; name: string; style_key: string | null } | null;
              }
            ).badge_definitions;
            return def
              ? { key: def.key, name: def.name, styleKey: def.style_key ?? "royal" }
              : null;
          })
          .filter((item): item is { key: string; name: string; styleKey: string } => Boolean(item)),
      };
    },
  });

  const p = data.data?.profile;
  const titles: Array<{ label: string; icon: "crown" | "shield" | "users" }> = [];
  for (const role of ["super_admin", "admin", "moderator", "host"]) {
    if (data.data?.roles.includes(role))
      titles.push({ label: ROLE_LABELS[role] ?? role, icon: "shield" });
  }
  if (isRoomOwner) titles.push({ label: "صاحب الغرفة", icon: "crown" });
  if (isRoomModerator) titles.push({ label: "مشرف الغرفة", icon: "shield" });
  if (data.data?.familyRole) {
    titles.push({
      label: `${FAMILY_ROLE_LABELS[data.data.familyRole] ?? "عضو عائلة"}${
        data.data.familyName ? ` · ${data.data.familyName}` : ""
      }`,
      icon: "users",
    });
  }

  const badges = data.data?.badges ?? [];
  const vip = Number(p?.vip_level ?? 0);
  const cvip = Number(p?.cvip_level ?? 0);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-b from-primary/12 via-background/70 to-background/90 p-4 text-center backdrop-blur-xl shadow-glow",
        className,
      )}
    >
      {/* الصورة داخل إطار المستخدم */}
      <div className="flex justify-center">
        <UserAvatar
          src={p?.avatar_url ?? null}
          name={p?.display_name ?? ""}
          size={78}
          vipLevel={vip}
          frame={p?.frame_url ?? null}
        />
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5">
        {p?.gender === "male" ? (
          <span className="rounded-full bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-300">
            ♂
          </span>
        ) : p?.gender === "female" ? (
          <span className="rounded-full bg-pink-500/20 px-1.5 py-0.5 text-[10px] text-pink-300">
            ♀
          </span>
        ) : null}
        <VipName
          name={p?.display_name ?? "مستخدم"}
          vipLevel={vip}
          className="text-base font-black"
        />
      </div>

      <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px] font-bold text-muted-foreground">
        {p?.country && <span>{p.country}</span>}
        <span className="opacity-40">|</span>
        <span className="text-foreground">ID: {p?.public_id ?? "—"}</span>
        <span className="opacity-40">|</span>
        <span>المستوى {Number(p?.level ?? 0)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
        <span className="flex items-center gap-1 rounded-full border border-primary/30 bg-background/70 px-2 py-0.5 text-[10px] font-bold">
          <Coins className="h-3 w-3 text-warning" />
          {(data.data?.gifted ?? 0).toLocaleString("en-US")}
        </span>
        {cvip > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[10px] font-black text-accent">
            <Heart className="h-3 w-3" />
            CVIP {cvip}
          </span>
        )}
        {vip > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[10px] font-black text-warning">
            <Crown className="h-3 w-3" />
            VIP {vip}
          </span>
        )}
      </div>

      {/* شرائط المناصب */}
      {(data.isLoading || titles.length > 0) && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {data.isLoading ? (
            <span className="h-6 w-28 animate-pulse rounded-full bg-foreground/10" />
          ) : (
            titles.map((title) => (
              <span
                key={title.label}
                className="flex items-center gap-1 rounded-full border border-warning/50 bg-gradient-to-b from-warning/25 to-primary/20 px-2.5 py-1 text-[10px] font-black text-warning shadow"
              >
                {title.icon === "crown" && <Crown className="h-3 w-3" />}
                {title.icon === "shield" && <Shield className="h-3 w-3" />}
                {title.icon === "users" && <Users className="h-3 w-3" />}
                {title.label}
              </span>
            ))
          )}
        </div>
      )}

      {/* الشارات */}
      {badges.length > 0 && (
        <div className="mt-3 flex items-center justify-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {badges.map((badge) => {
            const art = badgeArt(badge.key, badge.styleKey);
            return (
              <span key={badge.key} className="flex w-14 shrink-0 flex-col items-center gap-0.5">
                {art ? (
                  <img
                    src={art}
                    alt={badge.name}
                    loading="lazy"
                    width={816}
                    height={816}
                    className="h-9 w-9 object-contain drop-shadow"
                  />
                ) : (
                  <Shield className="h-8 w-8 text-primary" />
                )}
                <span className="w-full truncate text-center text-[8px] font-bold">
                  {badge.name}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {p?.public_id && (
        <Link
          to="/u/$publicId"
          params={{ publicId: p.public_id }}
          onClick={onNavigate}
          className="mt-4 block rounded-full bg-gradient-to-r from-success to-success/70 py-2.5 text-sm font-black text-background shadow-lg"
        >
          المزيد
        </Link>
      )}
    </div>
  );
}
