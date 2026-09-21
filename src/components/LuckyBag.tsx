import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Gift, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useRefreshMoney, useSupabaseSession, useWallet } from "@/hooks/use-session";

/** الأنواع المولّدة لا تعرف جداول حقيبة الحظ بعد. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type LuckyBagRow = {
  id: string;
  sender_id: string;
  total_amount: number;
  winners_count: number;
  claimed_count: number;
  remaining_amount: number;
  status: string;
  expires_at: string;
  message: string | null;
};

const AMOUNT_STEPS = [1_000_000, 10_000_000, 100_000_000, 1_000_000_000];
const WINNER_STEPS = [3, 5, 10, 20];

function short(n: number) {
  if (n >= 1_000_000_000) return `${n / 1_000_000_000}B`;
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  return n.toLocaleString("en-US");
}

/** قائمة حقائب الحظ المفتوحة داخل الغرفة مع زر الفتح. */
export function LuckyBagStrip({ roomId }: { roomId: string }) {
  const qc = useQueryClient();
  const { userId } = useSupabaseSession();
  const refreshMoney = useRefreshMoney();
  const [won, setWon] = useState<number | null>(null);

  const bags = useQuery<LuckyBagRow[]>({
    queryKey: ["lucky-bags", roomId],
    queryFn: async () => {
      const { data, error } = await db
        .from("lucky_bags")
        .select("id, sender_id, total_amount, winners_count, claimed_count, remaining_amount, status, expires_at, message")
        .eq("room_id", roomId)
        .eq("status", "open")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as LuckyBagRow[];
    },
    staleTime: 3000,
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
  });

  const myClaims = useQuery<string[]>({
    queryKey: ["lucky-bag-claims", roomId, userId],
    enabled: Boolean(userId) && (bags.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = (bags.data ?? []).map((b) => b.id);
      const { data, error } = await db.from("lucky_bag_claims").select("bag_id").eq("user_id", userId).in("bag_id", ids);
      if (error) throw error;
      return (data ?? []).map((r: { bag_id: string }) => r.bag_id);
    },
  });

  // قناة واحدة ثابتة للغرفة: الاعتماد على كائن الاستعلام كان يعيد الاشتراك كل رسم فتضيع الأحداث.
  useEffect(() => {
    const channel = supabase
      .channel(`lucky-bags-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lucky_bags", filter: `room_id=eq.${roomId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["lucky-bags", roomId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, qc]);

  const open = useMutation({
    mutationFn: async (bagId: string) => {
      const { data, error } = await db.rpc("open_lucky_bag", { _bag_id: bagId });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: async (amount) => {
      setWon(amount);
      window.setTimeout(() => setWon(null), 3000);
      refreshMoney();
      await Promise.all([bags.refetch(), qc.invalidateQueries({ queryKey: ["lucky-bag-claims", roomId, userId] })]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر فتح الحقيبة"),
  });

  const list = bags.data ?? [];
  if (list.length === 0) return null;

  return (
    <div className="space-y-2">
      {won !== null && (
        <div className="lucky-win animate-in fade-in zoom-in rounded-2xl border border-primary/40 bg-primary/15 px-3 py-2 text-center text-xs font-extrabold text-primary">
          🎉 فزت بـ {won.toLocaleString("en-US")} كوينز
        </div>
      )}
      {list.map((bag) => {
        const claimed = (myClaims.data ?? []).includes(bag.id);
        return (
          <div key={bag.id} className="lucky-envelope flex items-center gap-2 rounded-2xl px-3 py-2">
            <span className="text-xl">🧧</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-extrabold text-white">
                حقيبة حظ {bag.total_amount.toLocaleString("en-US")} كوينز · {bag.winners_count} فائزين
              </p>
              <p className="text-[10px] text-white/75">
                {bag.claimed_count} من {bag.winners_count} حصلوا عليها
              </p>
            </div>
            <Button
              size="sm"
              disabled={claimed || open.isPending || bag.claimed_count >= bag.winners_count}
              onClick={() => open.mutate(bag.id)}
              className="h-8 rounded-xl gradient-gold px-3 text-[11px] font-extrabold text-primary-foreground"
            >
              {claimed ? "تم" : bag.claimed_count >= bag.winners_count ? "FULL" : "OPEN"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/** نافذة إنشاء حقيبة حظ: المبلغ وعدد الفائزين، والخصم على الخادم. */
export function LuckyBagSheet({
  roomId,
  open,
  onOpenChange,
}: {
  roomId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { userId } = useSupabaseSession();
  const wallet = useWallet(userId);
  const refreshMoney = useRefreshMoney();
  const [total, setTotal] = useState(10_000_000);
  const [winners, setWinners] = useState(3);

  const balance = wallet.data?.coins ?? 0;
  const perWinner = useMemo(() => Math.floor(total / Math.max(1, winners)), [total, winners]);

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("create_lucky_bag", {
        _room_id: roomId,
        _total: total,
        _winners: winners,
        _message: null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("تم إرسال حقيبة الحظ 🧧");
      refreshMoney();
      await qc.invalidateQueries({ queryKey: ["lucky-bags", roomId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إنشاء الحقيبة"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="text-lg">🧧</span> حقيبة الحظ
          </SheetTitle>
        </SheetHeader>

        <div className="lucky-envelope mt-3 rounded-3xl p-4 text-center">
          <p className="text-[11px] text-white/80">قيمة الحقيبة</p>
          <p className="text-2xl font-extrabold text-white">{total.toLocaleString("en-US")}</p>
          <p className="mt-1 text-[11px] text-white/80">{winners} فائزين · متوسط {perWinner.toLocaleString("en-US")}</p>
        </div>

        <p className="mt-4 text-[11px] font-bold text-muted-foreground">المبلغ الإجمالي</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {AMOUNT_STEPS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTotal(n)}
              className={cn(
                "rounded-2xl border border-border bg-surface py-2 text-[11px] font-extrabold",
                total === n && "gradient-gold text-primary-foreground",
              )}
            >
              {short(n)}
            </button>
          ))}
        </div>
        <Input
          type="number"
          min={1_000_000}
          value={total}
          onChange={(e) => setTotal(Math.max(0, Number(e.target.value)))}
          className="mt-2 h-11 rounded-2xl"
          placeholder="مبلغ مخصص"
        />

        <p className="mt-4 text-[11px] font-bold text-muted-foreground">عدد الفائزين</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {WINNER_STEPS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setWinners(n)}
              className={cn(
                "rounded-2xl border border-border bg-surface py-2 text-[11px] font-extrabold",
                winners === n && "gradient-gold text-primary-foreground",
              )}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-surface px-3 py-2 text-xs">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Coins className="h-3.5 w-3.5 text-primary" /> رصيدك
          </span>
          <span className="font-extrabold">{balance.toLocaleString("en-US")}</span>
        </div>

        <Button
          onClick={() => create.mutate()}
          disabled={create.isPending || total < 1_000_000 || total > balance}
          className="mt-3 h-12 w-full rounded-2xl gradient-gold font-extrabold text-primary-foreground"
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="me-1 h-4 w-4" />}
          إرسال حقيبة الحظ
        </Button>
        {total > balance && <p className="mt-2 text-center text-[11px] text-destructive">رصيدك غير كافٍ لهذه الحقيبة</p>}
        <div className="pb-4" />
      </SheetContent>
    </Sheet>
  );
}
