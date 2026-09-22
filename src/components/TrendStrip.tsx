import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame, Gift, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";

type TrendRoom = { id: string; name: string; image_url: string | null; member_count: number };

/** شريط الترند: أعلى 3 غرف وأعلى مُهدٍ اليوم. */
export function TrendStrip() {
  const rooms = useQuery({
    queryKey: ["trend", "rooms"],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, image_url, member_count")
        .eq("is_disabled", false)
        .order("member_count", { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as TrendRoom[];
    },
  });

  const topGifter = useQuery({
    queryKey: ["trend", "gifter"],
    refetchInterval: 60000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("gift_transactions")
        .select("sender_id, total_price")
        .gte("created_at", since)
        .limit(1000);
      if (error) throw error;
      const totals = new Map<string, number>();
      for (const row of data ?? []) {
        totals.set(row.sender_id, (totals.get(row.sender_id) ?? 0) + Number(row.total_price ?? 0));
      }
      const best = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!best) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url, vip_level")
        .eq("id", best[0])
        .maybeSingle();
      if (!profile) return null;
      return { profile, total: best[1] };
    },
  });

  const list = rooms.data ?? [];
  if (list.length === 0 && !topGifter.data) return null;

  return (
    <section className="cover-sheen rounded-3xl border border-primary/25 bg-surface/70 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Flame className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-black">الترند الآن</h2>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {list.map((r, i) => (
          <Link
            key={r.id}
            to="/rooms/$roomId"
            params={{ roomId: r.id }}
            className="relative flex w-24 shrink-0 flex-col items-center gap-1 rounded-2xl border border-border/60 bg-surface-2/70 p-2"
          >
            <span
              className={cn(
                "absolute -top-1.5 -start-1.5 rounded-full px-1.5 text-[10px] font-black",
                i === 0
                  ? "gradient-gold text-primary-foreground"
                  : "bg-surface text-muted-foreground",
              )}
            >
              #{i + 1}
            </span>
            <UserAvatar src={r.image_url} name={r.name} size={44} />
            <span className="w-full truncate text-center text-[10px] font-bold">{r.name}</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Users className="h-3 w-3" />
              {r.member_count}
            </span>
          </Link>
        ))}
        {topGifter.data && (
          <Link
            to="/u/$publicId"
            params={{ publicId: topGifter.data.profile.public_id }}
            className="flex w-28 shrink-0 flex-col items-center gap-1 rounded-2xl border border-primary/40 bg-primary/10 p-2"
          >
            <UserAvatar
              src={topGifter.data.profile.avatar_url}
              name={topGifter.data.profile.display_name}
              size={44}
              vipLevel={topGifter.data.profile.vip_level}
            />
            <span className="w-full truncate text-center text-[10px] font-bold">
              {topGifter.data.profile.display_name}
            </span>
            <span className="flex items-center gap-1 text-[10px] font-bold text-primary">
              <Gift className="h-3 w-3" />
              أعلى مُهدٍ
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
