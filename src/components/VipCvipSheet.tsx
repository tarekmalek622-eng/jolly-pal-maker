import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Coins, Crown, Gift, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getVipBadgeArt, getVipFrame, getVipName, getVipVisual } from "@/lib/vip-frames";
import { useSupabaseSession } from "@/hooks/use-session";

/** الأنواع المولّدة لا تعرف جدول cvip_plans بعد. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type VipLevel = {
  level: number;
  name: string;
  price: number;
  duration_days: number;
  perks: unknown;
};

type CvipPlan = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_days: number;
  perks: unknown;
};

function perkList(perks: unknown): string[] {
  if (Array.isArray(perks)) return perks.map((p) => String(p));
  if (perks && typeof perks === "object")
    return Object.values(perks as Record<string, unknown>).map((p) => String(p));
  return [];
}

/** تفعيل مميزات VIP أو CVIP بالكوينز مباشرة من صفحة الحساب. */
export function VipCvipSheet({
  open,
  onOpenChange,
  mode,
  currentVip = 0,
  isCvip = false,
  cvipExpiresAt = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "vip" | "cvip";
  currentVip?: number;
  isCvip?: boolean;
  cvipExpiresAt?: string | null;
}) {
  const qc = useQueryClient();
  const { userId } = useSupabaseSession();

  const vip = useQuery({
    queryKey: ["vip-levels-sheet"],
    enabled: open && mode === "vip",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vip_levels")
        .select("level, name, price, duration_days, perks")
        .eq("is_active", true)
        .order("level");
      if (error) throw error;
      return (data ?? []) as VipLevel[];
    },
  });

  const cvip = useQuery({
    queryKey: ["cvip-plans-sheet"],
    enabled: open && mode === "cvip",
    queryFn: async () => {
      const { data, error } = await db
        .from("cvip_plans")
        .select("id, name, description, price, duration_days, perks")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CvipPlan[];
    },
  });

  const buy = useMutation({
    mutationFn: async (payload: { level?: number; planId?: string }) => {
      if (payload.level !== undefined) {
        const { error } = await supabase.rpc("purchase_vip", { _level: payload.level });
        if (error) throw error;
      } else if (payload.planId) {
        const { error } = await db.rpc("purchase_cvip", { _plan_id: payload.planId });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success("تم تفعيل المميزات 🎉");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["profile"] }),
        qc.invalidateQueries({ queryKey: ["room-people"] }),
        qc.invalidateQueries({ queryKey: ["wallet"] }),
        qc.invalidateQueries({ queryKey: ["coin-transactions"] }),
        qc.invalidateQueries({ queryKey: ["badge-strip", userId] }),
      ]);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التفعيل"),
  });

  const [giftLevel, setGiftLevel] = useState<number | null>(null);

  const friends = useQuery({
    queryKey: ["vip-gift-friends", userId],
    enabled: open && mode === "vip" && Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friends")
        .select("friend_id")
        .eq("user_id", userId!);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.friend_id);
      if (ids.length === 0) return [] as { id: string; display_name: string; public_id: string }[];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, public_id")
        .in("id", ids);
      if (pErr) throw pErr;
      return (profiles ?? []) as { id: string; display_name: string; public_id: string }[];
    },
  });

  const gift = useMutation({
    mutationFn: async (payload: { level: number; receiverId: string }) => {
      const { error } = await db.rpc("gift_vip", {
        _receiver_id: payload.receiverId,
        _level: payload.level,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("تم إرسال هدية VIP 🎁");
      setGiftLevel(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["wallet"] }),
        qc.invalidateQueries({ queryKey: ["coin-transactions"] }),
        qc.invalidateQueries({ queryKey: ["room-people"] }),
      ]);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إرسال الهدية"),
  });

  const loading = mode === "vip" ? vip.isLoading : cvip.isLoading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {mode === "vip" ? (
              <Crown className="h-4 w-4 text-primary" />
            ) : (
              <Sparkles className="h-4 w-4 text-accent" />
            )}
            {mode === "vip" ? "مميزات VIP" : "مميزات SVIP"}
          </SheetTitle>
        </SheetHeader>

        <p className="mt-2 text-[11px] text-muted-foreground">
          {mode === "vip"
            ? currentVip > 0
              ? `مستواك الحالي: VIP ${currentVip}`
              : "لم تفعّل VIP بعد"
            : isCvip
              ? `SVIP مفعّل${cvipExpiresAt ? ` حتى ${new Date(cvipExpiresAt).toLocaleDateString("ar-EG")}` : ""}`
              : "SVIP غير مفعّل"}
        </p>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mt-4 space-y-3 pb-6">
            {mode === "vip"
              ? (vip.data ?? []).map((v) => (
                  <div
                    key={v.level}
                    className={cn("rounded-2xl border p-4", getVipVisual(v.level)?.tierClass)}
                  >
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                      <div className="flex shrink-0 items-center gap-1">
                        <img
                          src={getVipBadgeArt(v.level) ?? ""}
                          width={56}
                          height={56}
                          loading="lazy"
                          alt={`شارة VIP ${v.level}`}
                          className={cn(
                            "h-14 w-14 object-contain drop-shadow",
                            getVipVisual(v.level)?.badgeClass,
                          )}
                        />
                        <img
                          src={getVipFrame(v.level) ?? ""}
                          width={48}
                          height={48}
                          loading="lazy"
                          alt={`إطار VIP ${v.level}`}
                          className={cn(
                            "h-12 w-12 object-contain opacity-90",
                            getVipVisual(v.level)?.frameClass,
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">VIP {v.level}</p>
                        <p className={cn("truncate text-[10px]", getVipVisual(v.level)?.nameClass)}>
                          {getVipName(v.level)}
                        </p>
                        <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                          {getVipVisual(v.level)?.entryLabel}
                        </p>
                      </div>
                      <span className="flex items-center gap-1 text-xs">
                        <Coins className="h-3.5 w-3.5 text-primary" />
                        {v.price.toLocaleString("en-US")}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {v.duration_days} يومًا
                    </p>
                    <ul className="mt-2 space-y-1">
                      {perkList(v.perks).map((p) => (
                        <li key={p} className="text-[11px] text-muted-foreground">
                          • {p}
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={() => buy.mutate({ level: v.level })}
                      disabled={buy.isPending || currentVip >= v.level}
                      className="mt-3 h-11 w-full rounded-2xl gradient-gold text-primary-foreground"
                    >
                      {currentVip >= v.level ? "مفعّل بالفعل" : "تفعيل الآن"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setGiftLevel(giftLevel === v.level ? null : v.level)}
                      className="mt-2 h-10 w-full rounded-2xl border-primary/40 text-xs text-primary"
                    >
                      <Gift className="me-1 h-4 w-4" />
                      {giftLevel === v.level ? "إلغاء الإهداء" : "إهداء VIP لصديق"}
                    </Button>
                    {giftLevel === v.level && (
                      <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-2xl border border-border/60 bg-surface/60 p-2">
                        {friends.isLoading ? (
                          <p className="py-3 text-center text-[11px] text-muted-foreground">
                            جارٍ التحميل...
                          </p>
                        ) : (friends.data ?? []).length === 0 ? (
                          <p className="py-3 text-center text-[11px] text-muted-foreground">
                            لا يوجد أصدقاء بعد — أضف صديقًا أولًا.
                          </p>
                        ) : (
                          (friends.data ?? []).map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              disabled={gift.isPending}
                              onClick={() => gift.mutate({ level: v.level, receiverId: f.id })}
                              className="flex w-full items-center justify-between rounded-xl bg-background/60 px-3 py-2 text-start"
                            >
                              <span className="truncate text-[12px] font-bold">
                                {f.display_name}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                ID {f.public_id}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              : (cvip.data ?? []).map((c) => (
                  <div key={c.id} className="svip-showcase p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">{c.name}</p>
                      <span className="flex items-center gap-1 text-xs">
                        <Coins className="h-3.5 w-3.5 text-primary" />
                        {c.price.toLocaleString("en-US")}
                      </span>
                    </div>
                    {c.description && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{c.description}</p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {c.duration_days} يومًا
                    </p>
                    <ul className="mt-2 space-y-1">
                      {perkList(c.perks).map((p) => (
                        <li key={p} className="text-[11px] text-muted-foreground">
                          • {p}
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={() => buy.mutate({ planId: c.id })}
                      disabled={buy.isPending}
                      className="mt-3 h-11 w-full rounded-2xl gradient-gold text-primary-foreground"
                    >
                      تفعيل الآن
                    </Button>
                  </div>
                ))}
            {mode === "vip" && (vip.data ?? []).length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                لا توجد مستويات VIP مفعّلة من الإدارة.
              </p>
            )}
            {mode === "cvip" && (cvip.data ?? []).length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                لا توجد خطط SVIP مفعّلة من الإدارة.
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
