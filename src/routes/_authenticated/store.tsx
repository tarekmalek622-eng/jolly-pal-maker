import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Crown, Gem, Loader2, ShoppingBag, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { StoreItemCard } from "@/components/StoreItemCard";
import { useMyProfile, useRefreshMoney, useSupabaseSession, useWallet } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/store")({
  head: () => ({
    meta: [
      { title: "المتجر وVIP — صوتك" },
      { name: "description", content: "اشترِ إطارات وخلفيات وشارات وتأثيرات ومستويات VIP بالكوينز داخل التطبيق." },
      { property: "og:title", content: "المتجر وVIP — صوتك" },
      { property: "og:description", content: "عناصر تزيين للملف والغرفة والمايك ومستويات VIP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StorePage,
});

const CATEGORIES: { key: string; label: string }[] = [
  { key: "profile_frame", label: "إطارات" },
  { key: "profile_background", label: "خلفيات ملف" },
  { key: "room_background", label: "خلفيات غرف" },
  { key: "room_decoration", label: "زينة الغرفة" },
  { key: "mic_decoration", label: "زينة المايك" },
  { key: "badge", label: "شارات" },
  { key: "effect", label: "تأثيرات" },
  { key: "profile_theme", label: "ثيمات" },
];

function StorePage() {
  const { userId } = useSupabaseSession();
  const profile = useMyProfile(userId);
  const wallet = useWallet(userId);
  const refresh = useRefreshMoney();
  const [tab, setTab] = useState<"items" | "vip" | "cvip">("items");
  const [category, setCategory] = useState(CATEGORIES[0]!.key);

  const items = useQuery({
    queryKey: ["store-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_items")
        .select("*")
        .eq("is_active", true)
        .order("price", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const myItems = useQuery({
    queryKey: ["my-items", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_items")
        .select("id, item_id, is_equipped, created_at, expires_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refundSettings = useQuery({
    queryKey: ["domino-settings-refund"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "domino").maybeSingle();
      const value = (data?.value ?? {}) as { refund_hours?: number };
      return value.refund_hours ?? 24;
    },
  });

  const refundItem = useMutation({
    mutationFn: async (userItemId: string) => {
      const { error } = await supabase.rpc("refund_item" as never, { _user_item_id: userItemId } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الاسترداد وأُعيدت الكوينز");
      refresh();
      void myItems.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الاسترداد"),
  });

  const vip = useQuery({
    queryKey: ["vip-levels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vip_levels")
        .select("*")
        .eq("is_active", true)
        .order("level", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const cvip = useQuery({
    queryKey: ["cvip-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cvip_plans").select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const buyItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.rpc("purchase_item", { _item_id: itemId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الشراء بنجاح");
      refresh();
      void myItems.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الشراء"),
  });

  const buyVip = useMutation({
    mutationFn: async (level: number) => {
      const { error } = await supabase.rpc("purchase_vip", { _level: level });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تفعيل VIP 👑");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تفعيل VIP"),
  });

  const buyCvip = useMutation({
    mutationFn: async (planId: string) => {
      const { error } = await supabase.rpc("purchase_cvip", { _plan_id: planId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تفعيل CVIP ✨");
      refresh();
      void profile.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تفعيل CVIP"),
  });

  const owned = new Set((myItems.data ?? []).map((i) => i.item_id));
  const refundHours = refundSettings.data ?? 24;
  const refundable = (myItems.data ?? []).filter(
    (ui) =>
      !ui.is_equipped &&
      (!ui.expires_at || new Date(ui.expires_at).getTime() > Date.now()) &&
      Date.now() - new Date(ui.created_at).getTime() < refundHours * 3600_000,
  );
  const filtered = (items.data ?? []).filter((i) => i.category === category);

  return (
    <AppShell
      header={
        <PageHeader
          title="المتجر"
          subtitle={`رصيدك: ${(wallet.data?.coins ?? 0).toLocaleString("en-US")} كوينز`}
        />
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1">
        {([["items", "العناصر", ShoppingBag], ["vip", "VIP", Crown], ["cvip", "CVIP", Gem]] as const).map(([key, label, Icon]) => (
          <Button
            key={key}
            variant="ghost"
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-colors",
              tab === key ? "gradient-gold text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        ))}
      </div>

      {tab === "items" ? (
        <>
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs",
                  category === c.key ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          {items.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState title="لا توجد عناصر في هذا القسم" />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((item) => (
                <StoreItemCard
                  key={item.id}
                  item={item}
                  owned={owned.has(item.id)}
                  busy={buyItem.isPending}
                  onBuy={() => buyItem.mutate(item.id)}
                />
              ))}
            </div>
          )}
          {refundable.length > 0 && (
            <div className="mt-6">
              <p className="mb-1 text-sm font-bold">قابل للاسترداد</p>
              <p className="mb-2 text-[11px] text-muted-foreground">
                يمكن استرداد المنتج خلال {refundSettings.data ?? 24} ساعة من الشراء إذا كان غير مُفعّل، وتعود الكوينز إلى محفظتك.
              </p>
              <div className="space-y-2">
                {refundable.map((ui) => {
                  const item = (items.data ?? []).find((i) => i.id === ui.item_id);
                  return (
                    <div key={ui.id} className="surface-card flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{item?.name ?? "منتج"}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(item?.price ?? 0).toLocaleString("en-US")} كوينز
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        disabled={refundItem.isPending}
                        onClick={() => refundItem.mutate(ui.id)}
                        className="h-9 rounded-xl px-4 text-[11px]"
                      >
                        استرداد
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : tab === "vip" ? (
        <div className="space-y-3">
          {(vip.data ?? []).map((v) => {
            const current = (profile.data?.vip_level ?? 0) >= v.level;
            return (
              <div key={v.level} className={cn("surface-card p-4", `vip-tier-${v.level}`)}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="flex items-center gap-2 text-base font-black">
                      <Crown className="h-5 w-5 text-primary" /> {v.name}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {v.duration_days} يوم · {v.price.toLocaleString("en-US")} كوينز
                    </p>
                  </div>
                  <Button
                    disabled={current || buyVip.isPending}
                    onClick={() => buyVip.mutate(v.level)}
                    className="h-10 rounded-2xl gradient-gold text-xs font-bold text-primary-foreground"
                  >
                    {current ? "مفعّل" : "تفعيل"}
                  </Button>
                </div>
                {v.name_effect && (
                  <p className="mt-3 text-[11px] text-muted-foreground">تأثير الاسم: {v.name_effect}</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="cvip-showcase overflow-hidden p-5 text-center">
            <Gem className="mx-auto h-8 w-8 text-accent" />
            <h2 className="mt-2 text-xl font-black">عضوية CVIP</h2>
            <p className="mt-1 text-xs text-muted-foreground">هوية مستقلة، متجر خاص، هدايا وتأثيرات حصرية.</p>
          </div>
          {(cvip.data ?? []).map((plan) => {
            const perks = Array.isArray(plan.perks) ? plan.perks.filter((value): value is string => typeof value === "string") : [];
            return (
              <div key={plan.id} className="surface-card border-accent/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-black"><Sparkles className="h-4 w-4 text-accent" />{plan.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent/15 px-2 py-1 text-[10px] text-accent">{plan.duration_days} يوم</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">{perks.map((perk) => <span key={perk} className="rounded-full bg-surface-2 px-2 py-1 text-[10px]">{perk}</span>)}</div>
                <Button disabled={buyCvip.isPending} onClick={() => buyCvip.mutate(plan.id)} className="mt-4 h-11 w-full rounded-2xl gradient-rose font-bold text-primary-foreground">
                  <Gem className="me-2 h-4 w-4" /> {plan.price.toLocaleString("en-US")} كوينز
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
