import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Coins, Loader2, Search, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { GiftPlayer, GiftThumb, type GiftMediaRow } from "@/components/GiftMedia";
import { useRefreshMoney, useWallet, useSupabaseSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

/** الأنواع المولّدة لا تعرف الأعمدة الجديدة بعد. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type GiftTarget = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  vip_level: number;
  public_id?: string | null;
};

type GiftRow = GiftMediaRow & { price: number; category: string; required_vip: number };

const CATEGORY_LABELS: Record<string, string> = {
  all: "الكل",
  flowers: "🌹 ورد",
  kings: "👑 ملوك",
  diamond: "💎 ألماس",
  cars: "🚗 سيارات",
  luxury: "✈️ فخامة",
  boxes: "🎁 صناديق",
  legendary: "🔥 أسطوري",
  general: "عام",
  romantic: "رومانسي",
  love: "حب",
  celebration: "احتفالات",
  vip: "VIP",
  cvip: "SVIP",
  rare: "نادر",
  gold: "ذهب",
  occasions: "مناسبات",
  games: "ألعاب",
  animated: "متحركة",
  free: "مجاني",
};

/** ترتيب ثابت للتصنيفات الأساسية حتى لا تتغير أماكن الأزرار. */
const CATEGORY_ORDER = ["all", "flowers", "kings", "diamond", "cars", "luxury", "boxes", "legendary"];

export function GiftSheet({
  open,
  onOpenChange,
  roomId,
  targets,
  initialReceiverId,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomId?: string | null;
  targets: GiftTarget[];
  initialReceiverId?: string;
  onSent?: (giftName: string) => void | Promise<void>;
}) {
  const { userId } = useSupabaseSession();
  const wallet = useWallet(userId);
  const refresh = useRefreshMoney();
  const [selected, setSelected] = useState<string[]>(initialReceiverId ? [initialReceiverId] : []);
  const [giftId, setGiftId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const sendingRef = useRef(false);

  const gifts = useQuery<GiftRow[]>({
    queryKey: ["gifts-catalog"],
    queryFn: async () => {
      const { data, error } = await db
        .from("gifts")
        .select(
          "id, name, image_url, thumb_url, animation_url, video_url, sound_url, sound_enabled, duration_ms, display_scale, price, rarity, category, required_vip",
        )
        .eq("is_active", true)
        .order("sort_order")
        .order("price");
      if (error) throw error;
      return (data ?? []) as GiftRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    (gifts.data ?? []).forEach((g) => set.add(g.category));
    const known = CATEGORY_ORDER.filter((c) => c === "all" || set.has(c));
    const extra = Array.from(set).filter((c) => !CATEGORY_ORDER.includes(c));
    return [...known, ...extra];
  }, [gifts.data]);

  const visibleGifts = useMemo(() => {
    const list = gifts.data ?? [];
    if (category === "all") return list;
    if (category === "free") return list.filter((g) => g.price === 0);
    return list.filter((g) => g.category === category);
  }, [gifts.data, category]);

  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return targets
      .filter((t) => t.id !== userId)
      .filter((t) => !q || t.display_name.toLowerCase().includes(q) || (t.public_id ?? "").includes(q));
  }, [targets, userId, search]);

  const selectedGift = (gifts.data ?? []).find((g) => g.id === giftId) ?? null;
  const perPerson = (selectedGift?.price ?? 0) * quantity;
  const total = perPerson * selected.length;

  const toggleUser = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = useMutation({
    mutationFn: async () => {
      if (sendingRef.current) throw new Error("جارٍ إرسال الهدية بالفعل");
      sendingRef.current = true;
      try {
        if (selected.length === 0) throw new Error("اختر مستلمًا واحدًا على الأقل");
        if (!giftId) throw new Error("اختر الهدية");
        const { error } = await db.rpc("send_gift_bulk", {
          _gift_id: giftId,
          _receiver_ids: selected,
          _room_id: roomId ?? null,
          _quantity: quantity,
        });
        if (error) throw error;
      } finally {
        sendingRef.current = false;
      }
    },
    onSuccess: async () => {
      toast.success(selected.length > 1 ? `تم إرسال الهدية إلى ${selected.length} مستخدم 🎉` : "تم إرسال الهدية 🎉");
      if (selectedGift) await onSent?.(selectedGift.name);
      refresh();
      setQuantity(1);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إرسال الهدية"),
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>إرسال هدية</SheetTitle>
          </SheetHeader>

          <div className="pb-6">
            {/* المستلمون */}
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground">1) اختر المستلمين</p>
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                <Users className="h-3 w-3" /> تم تحديد {selected.length}
              </span>
            </div>

            <div className="relative mb-2">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو ID"
                className="h-10 rounded-xl pr-9 text-sm"
              />
            </div>

            <div className="mb-2 flex gap-2">
              <button
                onClick={() => setSelected(people.map((p) => p.id))}
                className="h-8 flex-1 rounded-xl border border-border bg-surface text-[11px] font-bold"
              >
                تحديد الكل
              </button>
              <button
                onClick={() => setSelected([])}
                className="h-8 flex-1 rounded-xl border border-border bg-surface text-[11px] font-bold"
              >
                إلغاء التحديد
              </button>
            </div>

            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد مستخدمون متاحون حاليًا.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {people.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleUser(t.id)}
                    className={cn(
                      "relative flex w-16 shrink-0 flex-col items-center gap-1 rounded-2xl border p-1.5 transition-colors",
                      selected.includes(t.id) ? "border-primary bg-primary/10" : "border-transparent",
                    )}
                  >
                    <UserAvatar src={t.avatar_url} name={t.display_name} size={44} vipLevel={t.vip_level} />
                    <span className="w-full truncate text-center text-[10px]">{t.display_name}</span>
                    {selected.includes(t.id) ? (
                      <span className="absolute -top-1 left-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold leading-4 text-primary-foreground">
                        ✓
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}

            {/* التصنيفات */}
            <p className="mb-2 mt-4 text-xs font-bold text-muted-foreground">2) اختر الهدية</p>
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "h-8 shrink-0 rounded-full px-3 text-[11px] font-bold",
                    category === c ? "gradient-gold text-primary-foreground" : "border border-border bg-surface text-muted-foreground",
                  )}
                >
                  {CATEGORY_LABELS[c] ?? c}
                </button>
              ))}
            </div>

            {gifts.isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : visibleGifts.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">لا توجد هدايا في هذا التصنيف.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {visibleGifts.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGiftId(g.id)}
                    className={cn(
                      "rounded-2xl border p-2 text-center transition-transform active:scale-95",
                      giftId === g.id ? "border-primary bg-primary/10" : "border-border bg-surface",
                    )}
                  >
                    <div className="flex h-10 items-center justify-center">
                      <GiftThumb gift={g} size={40} />
                    </div>
                    <p className="mt-1 truncate text-[10px] font-semibold">{g.name}</p>
                    <p className="text-[10px] text-primary">{g.price.toLocaleString("en-US")}</p>
                  </button>
                ))}
              </div>
            )}

            {/* معاينة التأثير */}
            {selectedGift ? (
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
                <GiftPlayer gift={selectedGift} muted className="h-20 w-20" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{selectedGift.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    معاينة التأثير · {Math.round((selectedGift.duration_ms ?? 3000) / 1000)} ثانية
                  </p>
                  <p className="text-[11px] text-primary">{selectedGift.price.toLocaleString("en-US")} كوينز للمستلم</p>
                </div>
              </div>
            ) : null}

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
              <span className="text-muted-foreground">رصيدك: {formatCompact(wallet.data?.coins ?? 0)}</span>
              <span className="flex items-center gap-1 font-bold" title={`${formatFull(total)} كوينز`}>
                <Coins className="h-4 w-4 text-primary" /> {formatCompact(total)}
              </span>
            </div>
          </div>

          {/* زر إرسال ثابت على يسار الشاشة — إرسال مباشر بدون تأكيد إضافي */}
          {open && (
            <button
              type="button"
              onClick={() => !send.isPending && send.mutate()}
              disabled={send.isPending || selected.length === 0 || !giftId}
              className={cn(
                "fixed bottom-6 left-4 z-[60] flex h-14 min-w-14 items-center gap-2 rounded-full px-4 text-xs font-black shadow-2xl transition-transform active:scale-95",
                send.isPending || selected.length === 0 || !giftId
                  ? "bg-surface-2 text-muted-foreground"
                  : "gradient-gold text-primary-foreground",
              )}
            >
              {send.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  <span className="leading-tight">
                    إرسال
                    {selected.length > 1 ? ` ×${selected.length}` : ""}
                    <span className="block text-[9px] font-bold opacity-80">{formatCompact(total)}</span>
                  </span>
                </>
              )}
            </button>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
