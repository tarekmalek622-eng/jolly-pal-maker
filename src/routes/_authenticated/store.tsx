import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, ShoppingBag } from "lucide-react";
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
  const [tab, setTab] = useState<"items" | "vip">("items");
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
      const { data, error } = await supabase.from("user_items").select("item_id, is_equipped").eq("user_id", userId!);
      if (error) throw error;
      return data ?? [];
    },
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

  const owned = new Set((myItems.data ?? []).map((i) => i.item_id));
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
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1">
        {([["items", "العناصر", ShoppingBag], ["vip", "VIP", Crown]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-colors",
              tab === key ? "gradient-gold text-primary-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
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
        </>
      ) : (
        <div className="space-y-3">
          {(vip.data ?? []).map((v) => {
            const current = (profile.data?.vip_level ?? 0) >= v.level;
            return (
              <div key={v.level} className="surface-card gradient-vip p-4">
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
      )}
    </AppShell>
  );
}
