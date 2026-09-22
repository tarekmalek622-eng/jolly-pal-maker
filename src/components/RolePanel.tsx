import { useQuery } from "@tanstack/react-query";
import { Crown, Shield, Sparkles, Star, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { badgeArt } from "@/lib/badge-art";
import { cn } from "@/lib/utils";

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
}

/** لوحة المناصب: تظهر مناصب المستخدم وشاراته داخل الغرفة بدون فتح الملف الشخصي. */
export function RolePanel({ userId, isRoomOwner, isRoomModerator, className }: RolePanelProps) {
  const data = useQuery({
    queryKey: ["role-panel", userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const uid = userId ?? "";
      const [roles, profile, family, badges] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase
          .from("profiles")
          .select("vip_level, cvip_level, level")
          .eq("id", uid)
          .maybeSingle(),
        supabase
          .from("family_members")
          .select("role, families(name)")
          .eq("user_id", uid)
          .maybeSingle(),
        supabase
          .from("user_badges")
          .select("id, badge_definitions(key, name, style_key, display_variant)")
          .eq("user_id", uid)
          .limit(12),
      ]);
      if (roles.error) throw roles.error;
      if (profile.error) throw profile.error;
      if (badges.error) throw badges.error;
      return {
        roles: (roles.data ?? []).map((row) => String(row.role)),
        vip: Number(profile.data?.vip_level ?? 0),
        cvip: Number(profile.data?.cvip_level ?? 0),
        level: Number(profile.data?.level ?? 0),
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

  const titles: Array<{ label: string; icon: "crown" | "shield" | "star" | "users" }> = [];
  for (const role of ["super_admin", "admin", "moderator", "host"]) {
    if (data.data?.roles.includes(role))
      titles.push({ label: ROLE_LABELS[role] ?? role, icon: "shield" });
  }
  if (isRoomOwner) titles.push({ label: "صاحب الغرفة", icon: "crown" });
  if (isRoomModerator) titles.push({ label: "مشرف الغرفة", icon: "shield" });
  if ((data.data?.cvip ?? 0) > 0) titles.push({ label: `CVIP ${data.data?.cvip}`, icon: "star" });
  if ((data.data?.vip ?? 0) > 0) titles.push({ label: `VIP ${data.data?.vip}`, icon: "star" });
  if (data.data?.familyRole) {
    titles.push({
      label: `${FAMILY_ROLE_LABELS[data.data.familyRole] ?? "عضو عائلة"}${data.data.familyName ? ` · ${data.data.familyName}` : ""}`,
      icon: "users",
    });
  }

  const badges = data.data?.badges ?? [];

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-background/45 p-3 backdrop-blur-xl shadow-lg",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        المنصب
      </div>
      {data.isLoading ? (
        <div className="h-6 w-2/3 animate-pulse rounded-full bg-foreground/10" />
      ) : titles.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">عضو · المستوى {data.data?.level ?? 0}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {titles.map((title) => (
            <span
              key={title.label}
              className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary"
            >
              {title.icon === "crown" && <Crown className="h-3 w-3" />}
              {title.icon === "shield" && <Shield className="h-3 w-3" />}
              {title.icon === "star" && <Star className="h-3 w-3" />}
              {title.icon === "users" && <Users className="h-3 w-3" />}
              {title.label}
            </span>
          ))}
        </div>
      )}

      {badges.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-2">
          <p className="mb-1.5 text-[10px] font-bold text-muted-foreground">الشارات</p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
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
        </div>
      )}
    </div>
  );
}
