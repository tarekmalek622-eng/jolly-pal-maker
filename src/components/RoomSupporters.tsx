import { useQuery } from "@tanstack/react-query";
import { Loader2, Trophy } from "lucide-react";
import { getRoomCupLeaderboard } from "@/lib/cups.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/UserAvatar";
import { VipName } from "@/components/VipName";
import { cn } from "@/lib/utils";
import { useState } from "react";

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
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const board = useQuery({
    queryKey: ["room-supporters", roomId, period],
    enabled: open,
    staleTime: 60_000,
    queryFn: () => getRoomCupLeaderboard({ data: { roomId, period } }) as Promise<Supporter[]>,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" /> كأس الغرفة · أكثر الداعمين
          </SheetTitle>
        </SheetHeader>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              ["day", "يومي"],
              ["week", "أسبوعي"],
              ["month", "شهري"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={cn(
                "rounded-xl border py-2 text-xs font-bold",
                period === key
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {board.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (board.data ?? []).length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            لا توجد هدايا في هذه الغرفة بعد.
          </p>
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
                <UserAvatar
                  src={s.avatar_url}
                  name={s.display_name}
                  size={40}
                  vipLevel={s.vip_level}
                />
                <div className="min-w-0 flex-1">
                  <VipName name={s.display_name} vipLevel={s.vip_level} className="block text-sm" />
                  <p className="text-[10px] text-muted-foreground">داعم للغرفة</p>
                </div>
                <span className="text-xs font-bold text-primary">
                  {s.coins.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </SheetContent>
    </Sheet>
  );
}
