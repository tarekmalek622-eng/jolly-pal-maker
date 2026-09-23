import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { badgeArt } from "@/lib/badge-art";
import { formatCoins } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

type NextBadge = { name: string; art: string; threshold: number; sent: number } | null;

/** بطاقة إنجاز اليوم: أقرب شارة لك ونسبة تقدّمها. */
export function AchievementOfDay({ userId }: { userId: string | null }) {
  const query = useQuery({
    queryKey: ["achievement-of-day", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<NextBadge> => {
      const [{ data: gifts }, { data: defs }, { data: owned }] = await Promise.all([
        db.from("gift_transactions").select("total_price").eq("sender_id", userId!).limit(1000),
        db
          .from("badge_definitions")
          .select("key, name, image_url, style_key, threshold, kind")
          .eq("kind", "gift"),
        db.from("user_badges").select("badge_key").eq("user_id", userId!),
      ]);
      const sent = (gifts ?? []).reduce(
        (total: number, row: { total_price: number | null }) => total + Number(row.total_price ?? 0),
        0,
      );
      const ownedKeys = new Set((owned ?? []).map((row: { badge_key: string }) => row.badge_key));
      const next = (defs ?? [])
        .filter((row: any) => !ownedKeys.has(row.key) && Number(row.threshold ?? 0) > 0)
        .sort((a: any, b: any) => Number(a.threshold) - Number(b.threshold))[0];
      if (!next) return null;
      return {
        name: next.name,
        art: next.image_url || badgeArt(next.key, next.style_key),
        threshold: Number(next.threshold),
        sent,
      };
    },
  });

  const data = query.data;
  if (!data) return null;
  const pct = Math.min(100, Math.round((data.sent / data.threshold) * 100));

  return (
    <Link to="/achievements" className="surface-card flex items-center gap-3 p-3">
      <img src={data.art} alt={data.name} className="h-12 w-12 rounded-xl object-cover" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-1 text-xs font-bold">
          <Award className="h-3.5 w-3.5 text-primary" />
          إنجاز اليوم: {data.name}
        </p>
        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-black/30">
          <span className="block h-full rounded-full gradient-gold" style={{ width: `${pct}%` }} />
        </span>
        <p className="text-[10px] text-muted-foreground">
          {formatCoins(data.sent)} / {formatCoins(data.threshold)} — {pct}%
        </p>
      </div>
    </Link>
  );
}
