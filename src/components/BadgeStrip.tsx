import { cn } from "@/lib/utils";
import { Award } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BadgeStripProps {
  count?: number;
  rank?: number | string;
  className?: string;
  userId?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "مالك التطبيق",
  admin: "مدير التطبيق",
  moderator: "مساعد سوبر أدمن",
  host: "مضيف",
};

export function BadgeStrip({ count, rank, className, userId }: BadgeStripProps) {
  const summary = useQuery({
    queryKey: ["badge-strip", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [badges, roles, profile] = await Promise.all([
        supabase.from("user_badges").select("id", { count: "exact", head: true }).eq("user_id", userId ?? ""),
        supabase.from("user_roles").select("role").eq("user_id", userId ?? ""),
        supabase.from("profiles").select("vip_level").eq("id", userId ?? "").maybeSingle(),
      ]);
      if (badges.error) throw badges.error;
      if (roles.error) throw roles.error;
      const ordered = ["super_admin", "admin", "moderator", "host"];
      const role = ordered.find((item) => (roles.data ?? []).some((row) => row.role === item));
      if (profile.error) throw profile.error;
      const vip = Number(profile.data?.vip_level ?? 0);
      return { count: badges.count ?? 0, rank: role ? ROLE_LABELS[role] : vip > 0 ? `VIP ${vip}` : rank };
    },
  });
  const shownCount = summary.data?.count ?? count;
  const shownRank = summary.data?.rank ?? rank;
  if (!shownCount && !shownRank) return null;
  
  return (
    <div className={cn(
      "flex items-center gap-1.5 rounded-full bg-background/60 px-2 py-0.5 text-[9px] font-bold backdrop-blur-md border border-white/10 shadow-sm transition-all",
      className
    )}>
      <Award className="h-3 w-3 text-primary" />
      {shownRank && <span>{shownRank}</span>}
      {shownCount !== undefined && (
        <span className="flex items-center gap-0.5">
          <span className="opacity-60">|</span>
          {shownCount} شارة
        </span>
      )}
    </div>
  );
}
