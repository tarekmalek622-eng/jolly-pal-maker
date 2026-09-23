import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Swords } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

type WarRow = { family_id: string; name: string; logo_url: string | null; points: number };

/** حرب العائلات الأسبوعية: ترتيب العائلات حسب نقاط الهدايا هذا الأسبوع. */
export function FamilyWar() {
  const query = useQuery({
    queryKey: ["family-war"],
    refetchInterval: 60000,
    queryFn: async (): Promise<WarRow[]> => {
      const { data, error } = await db.rpc("family_war_leaderboard", { _limit: 10 });
      if (error) throw new Error(error.message);
      return (data ?? []) as WarRow[];
    },
  });

  const rows = (query.data ?? []).filter((row) => Number(row.points) > 0);
  if (rows.length === 0) return null;

  return (
    <section className="surface-card space-y-2 p-4">
      <div className="flex items-center gap-2">
        <Swords className="h-4 w-4 text-primary" />
        <p className="flex-1 text-sm font-bold">حرب العائلات — هذا الأسبوع</p>
      </div>
      {rows.map((row, index) => (
        <Link
          key={row.family_id}
          to="/families/$familyId"
          params={{ familyId: row.family_id }}
          className="flex items-center gap-3 rounded-xl bg-surface p-2"
        >
          <span
            className={cn(
              "grid h-7 w-7 place-items-center rounded-full text-[11px] font-black",
              index === 0
                ? "gradient-gold text-primary-foreground"
                : "bg-background text-muted-foreground",
            )}
          >
            {index + 1}
          </span>
          {row.logo_url ? (
            <img src={row.logo_url} alt={row.name} className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-background text-sm">
              🛡️
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-xs font-bold">{row.name}</p>
          <p className="text-[11px] font-bold text-primary">{formatCoins(Number(row.points))}</p>
        </Link>
      ))}
    </section>
  );
}
