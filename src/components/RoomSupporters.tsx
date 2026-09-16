import { useQuery } from "@tanstack/react-query";
import { Loader2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/UserAvatar";
import { VipName } from "@/components/VipName";
import { cn } from "@/lib/utils";

type Supporter = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  vip_level: number;
  coins: number;
};

const MEDALS = ["🥇", "🥈", "🥉"];

/** كأس الغرفة: ترتيب أكثر الداعمين بالهدايا داخل هذه الغرفة. */
export function RoomSupporters({
  roomId,
  open,
  onOpenChange,
}: {
  roomId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const board = useQuery({
    queryKey: ["room-supporters", roomId],
    enabled: open,
    queryFn: async (): Promise<Supporter[]> => {
      const { data, error } = await supabase
        .from("gift_transactions")
        .select("sender_id, total_price")
        .eq("room_id", roomId)
        .limit(1000);
      if (error) throw error;
      const totals = new Map<string, number>();
      for (const row of data ?? []) {
        totals.set(row.sender_id, (totals.get(row.sender_id) ?? 0) + Number(row.total_price ?? 0));
      }
      const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      if (top.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, vip_level")
        .in("id", top.map(([id]) => id));
      if (pErr) throw pErr;
      return top.map(([id, coins]) => {
        const prof = (profiles ?? []).find((p) => p.id === id);
        return {
          id,
          display_name: prof?.display_name ?? "مستخدم",
          avatar_url: prof?.avatar_url ?? null,
          vip_level: prof?.vip_level ?? 0,
          coins,
        };
      });
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" /> كأس الغرفة · أكثر الداعمين
          </SheetTitle>
        </SheetHeader>

        {board.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (board.data ?? []).length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">لا توجد هدايا في هذه الغرفة بعد.</p>
        ) : (
          <ol className="mt-4 space-y-2 pb-6">
            {(board.data ?? []).map((s, i) => (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-2.5",
                  i === 0
                    ? "vip-tier-5"
                    : i === 1
                      ? "vip-tier-4"
                      : i === 2
                        ? "vip-tier-3"
                        : "border-border bg-surface",
                )}
              >
                <span className="w-7 text-center text-sm font-bold">{MEDALS[i] ?? i + 1}</span>
                <UserAvatar src={s.avatar_url} name={s.display_name} size={40} vipLevel={s.vip_level} />
                <div className="min-w-0 flex-1">
                  <VipName name={s.display_name} vipLevel={s.vip_level} className="block text-sm" />
                  <p className="text-[10px] text-muted-foreground">داعم للغرفة</p>
                </div>
                <span className="text-xs font-bold text-primary">{s.coins.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ol>
        )}
      </SheetContent>
    </Sheet>
  );
}
