import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

type CheckinRow = { last_day: string; streak: number; total_days: number } | null;

/** الحضور اليومي المتسلسل: سبعة أيام بمكافآت تزيد مع الاستمرار. */
export function DailyCheckin({ userId }: { userId: string | null }) {
  const state = useQuery({
    queryKey: ["daily-checkin", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<CheckinRow> => {
      const { data, error } = await db
        .from("daily_checkins")
        .select("last_day, streak, total_days")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as CheckinRow;
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const claimedToday = state.data?.last_day === today;
  const streak = claimedToday ? (state.data?.streak ?? 0) : 0;

  const claim = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("daily_checkin");
      if (error) throw new Error(error.message);
      return data as { claimed: boolean; streak: number; reward: number };
    },
    onSuccess: (result) => {
      if (result.claimed) {
        toast.success(`تم استلام مكافأة اليوم ${result.streak}: ${formatCoins(result.reward)}`);
      } else {
        toast.info("استلمت مكافأة اليوم بالفعل، عُد غدًا");
      }
      void state.refetch();
    },
    onError: (error: Error) => toast.error(error.message || "تعذر استلام المكافأة"),
  });

  return (
    <section className="surface-card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-4 w-4 text-primary" />
        <p className="flex-1 text-sm font-bold">الحضور اليومي</p>
        <span className="text-[11px] text-muted-foreground">
          أيام متتالية: {state.data?.streak ?? 0}
        </span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 7 }, (_, index) => {
          const day = index + 1;
          const done = day <= streak;
          return (
            <div
              key={day}
              className={cn(
                "flex-1 rounded-xl border p-1.5 text-center",
                done ? "gradient-gold border-transparent text-primary-foreground" : "border-border",
              )}
            >
              <p className="text-[10px] font-bold">يوم {day}</p>
              <p className="text-[9px] opacity-80">
                {done ? <Check className="mx-auto h-3 w-3" /> : formatCoins(1000 * day)}
              </p>
            </div>
          );
        })}
      </div>
      <Button
        disabled={claimedToday || claim.isPending}
        onClick={() => claim.mutate()}
        className="h-11 w-full rounded-2xl gradient-gold font-bold text-primary-foreground"
      >
        {claimedToday ? "تم الاستلام اليوم" : "استلم مكافأة اليوم"}
      </Button>
    </section>
  );
}
