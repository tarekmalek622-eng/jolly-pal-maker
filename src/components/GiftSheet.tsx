import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Coins, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { resolveMediaUrl } from "@/lib/media";
import { useRefreshMoney, useWallet, useSupabaseSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export type GiftTarget = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  vip_level: number;
};

export function GiftSheet({
  open,
  onOpenChange,
  roomId,
  targets,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomId: string;
  targets: GiftTarget[];
}) {
  const { userId } = useSupabaseSession();
  const wallet = useWallet(userId);
  const refresh = useRefreshMoney();
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [giftId, setGiftId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const gifts = useQuery({
    queryKey: ["gifts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gifts")
        .select("id, name, image_url, price, rarity, category")
        .eq("is_active", true)
        .order("price", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      if (!receiverId) throw new Error("اختر المستلم من داخل الغرفة");
      if (!giftId) throw new Error("اختر الهدية");
      const { error } = await supabase.rpc("send_gift", {
        _gift_id: giftId,
        _receiver_id: receiverId,
        _room_id: roomId,
        _quantity: quantity,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إرسال الهدية 🎉");
      refresh();
      onOpenChange(false);
      setGiftId(null);
      setQuantity(1);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إرسال الهدية"),
  });

  const selectedGift = (gifts.data ?? []).find((g) => g.id === giftId);
  const total = (selectedGift?.price ?? 0) * quantity;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>إرسال هدية</SheetTitle>
        </SheetHeader>

        <div className="pb-6">
          <p className="mb-2 text-xs font-bold text-muted-foreground">1) اختر المستلم</p>
          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد أعضاء في الغرفة حاليًا.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {targets
                .filter((t) => t.id !== userId)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setReceiverId(t.id)}
                    className={cn(
                      "flex w-16 shrink-0 flex-col items-center gap-1 rounded-2xl border p-1.5",
                      receiverId === t.id ? "border-primary bg-primary/10" : "border-transparent",
                    )}
                  >
                    <UserAvatar src={t.avatar_url} name={t.display_name} size={44} vipLevel={t.vip_level} />
                    <span className="w-full truncate text-center text-[10px]">{t.display_name}</span>
                  </button>
                ))}
            </div>
          )}

          <p className="mb-2 mt-4 text-xs font-bold text-muted-foreground">2) اختر الهدية</p>
          {gifts.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {(gifts.data ?? []).map((g) => (
                <GiftTile key={g.id} gift={g} selected={giftId === g.id} onSelect={() => setGiftId(g.id)} />
              ))}
            </div>
          )}

          <p className="mb-2 mt-4 text-xs font-bold text-muted-foreground">3) الكمية</p>
          <div className="flex gap-2">
            {[1, 5, 10, 50, 99].map((n) => (
              <button
                key={n}
                onClick={() => setQuantity(n)}
                className={cn(
                  "h-10 flex-1 rounded-xl border text-sm font-bold",
                  quantity === n ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted-foreground",
                )}
              >
                ×{n}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-2xl bg-surface p-3 text-sm">
            <span className="text-muted-foreground">رصيدك: {(wallet.data?.coins ?? 0).toLocaleString("en-US")}</span>
            <span className="flex items-center gap-1 font-bold">
              <Coins className="h-4 w-4 text-primary" /> {total.toLocaleString("en-US")}
            </span>
          </div>

          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || !receiverId || !giftId}
            className="mt-4 h-13 w-full rounded-2xl gradient-gold py-4 font-bold text-primary-foreground"
          >
            {send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "إرسال"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function GiftTile({
  gift,
  selected,
  onSelect,
}: {
  gift: { id: string; name: string; image_url: string | null; price: number };
  selected: boolean;
  onSelect: () => void;
}) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void resolveMediaUrl(gift.image_url).then((u) => active && setImg(u));
    return () => {
      active = false;
    };
  }, [gift.image_url]);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "rounded-2xl border p-2 text-center",
        selected ? "border-primary bg-primary/10" : "border-border bg-surface",
      )}
    >
      <div className="flex h-10 items-center justify-center text-xl">
        {img ? <img src={img} alt={gift.name} className="h-10 w-10 object-contain" loading="lazy" /> : "🎁"}
      </div>
      <p className="mt-1 truncate text-[10px] font-semibold">{gift.name}</p>
      <p className="text-[10px] text-primary">{gift.price.toLocaleString("en-US")}</p>
    </button>
  );
}
