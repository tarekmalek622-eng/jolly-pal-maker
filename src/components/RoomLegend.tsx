import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/UserAvatar";
import { formatCoins } from "@/lib/format";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

type Legend = { id: string; name: string; avatar: string | null; value: number };

/** أسطورة الغرفة: أكثر مُهدٍ وأكثر مستلم داخل هذه الغرفة خلال ٧ أيام. */
export function RoomLegend({ roomId }: { roomId: string }) {
  const query = useQuery({
    queryKey: ["room-legend", roomId],
    refetchInterval: 60000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await db
        .from("gift_transactions")
        .select("sender_id, receiver_id, total_price")
        .eq("room_id", roomId)
        .gte("created_at", since)
        .limit(2000);
      if (error) throw new Error(error.message);
      const senders = new Map<string, number>();
      const receivers = new Map<string, number>();
      for (const row of (data ?? []) as any[]) {
        const value = Number(row.total_price ?? 0);
        if (row.sender_id) senders.set(row.sender_id, (senders.get(row.sender_id) ?? 0) + value);
        if (row.receiver_id)
          receivers.set(row.receiver_id, (receivers.get(row.receiver_id) ?? 0) + value);
      }
      const topOf = (map: Map<string, number>) =>
        [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
      const top = [topOf(senders), topOf(receivers)];
      const ids = top.filter(Boolean).map((entry) => entry![0]);
      if (ids.length === 0) return { gifter: null, receiver: null };
      const { data: people } = await db
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", ids);
      const build = (entry: [string, number] | null): Legend | null => {
        if (!entry) return null;
        const person = (people ?? []).find((p: any) => p.id === entry[0]);
        return {
          id: entry[0],
          name: person?.display_name ?? "مستخدم",
          avatar: person?.avatar_url ?? null,
          value: entry[1],
        };
      };
      return { gifter: build(top[0]), receiver: build(top[1]) };
    },
  });

  if (!query.data?.gifter && !query.data?.receiver) return null;

  return (
    <section className="surface-card space-y-2 p-3">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-primary" />
        <p className="text-xs font-bold">أسطورة الغرفة — آخر ٧ أيام</p>
      </div>
      {[
        { label: "أكثر إهداءً", row: query.data.gifter },
        { label: "أكثر استلامًا", row: query.data.receiver },
      ].map(
        ({ label, row }) =>
          row && (
            <div key={label} className="flex items-center gap-2 rounded-xl bg-surface p-2">
              <UserAvatar src={row.avatar} name={row.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold">{row.name}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
              <p className="text-[11px] font-bold text-primary">{formatCoins(row.value)}</p>
            </div>
          ),
      )}
    </section>
  );
}
