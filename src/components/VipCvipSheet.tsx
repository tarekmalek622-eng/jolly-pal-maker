import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Crown, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  if (perks && typeof perks === "object") return Object.values(perks as Record<string, unknown>).map((p) => String(p));
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
      await qc.invalidateQueries();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التفعيل"),
  });

  const loading = mode === "vip" ? vip.isLoading : cvip.isLoading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {mode === "vip" ? <Crown className="h-4 w-4 text-primary" /> : <Sparkles className="h-4 w-4 text-accent" />}
            {mode === "vip" ? "مميزات VIP" : "مميزات CVIP"}
          </SheetTitle>
        </SheetHeader>

        <p className="mt-2 text-[11px] text-muted-foreground">
          {mode === "vip"
            ? currentVip > 0
              ? `مستواك الحالي: VIP ${currentVip}`
              : "لم تفعّل VIP بعد"
            : isCvip
              ? `CVIP مفعّل${cvipExpiresAt ? ` حتى ${new Date(cvipExpiresAt).toLocaleDateString("ar-EG")}` : ""}`
              : "CVIP غير مفعّل"}
        </p>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mt-4 space-y-3 pb-6">
            {mode === "vip"
              ? (vip.data ?? []).map((v) => (
                  <div key={v.level} className={cn("rounded-2xl border p-4", `vip-tier-${Math.min(5, v.level)}`)}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">{v.name}</p>
                      <span className="flex items-center gap-1 text-xs">
                        <Coins className="h-3.5 w-3.5 text-primary" />
                        {v.price.toLocaleString("en-US")}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">{v.duration_days} يومًا</p>
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
                  </div>
                ))
              : (cvip.data ?? []).map((c) => (
                  <div key={c.id} className="cvip-showcase p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">{c.name}</p>
                      <span className="flex items-center gap-1 text-xs">
                        <Coins className="h-3.5 w-3.5 text-primary" />
                        {c.price.toLocaleString("en-US")}
                      </span>
                    </div>
                    {c.description && <p className="mt-1 text-[11px] text-muted-foreground">{c.description}</p>}
                    <p className="mt-1 text-[10px] text-muted-foreground">{c.duration_days} يومًا</p>
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
              <p className="py-6 text-center text-xs text-muted-foreground">لا توجد مستويات VIP مفعّلة من الإدارة.</p>
            )}
            {mode === "cvip" && (cvip.data ?? []).length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">لا توجد خطط CVIP مفعّلة من الإدارة.</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
