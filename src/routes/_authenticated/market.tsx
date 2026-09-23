import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Download, Gift, Send, ShoppingBag, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useRefreshMoney, useSupabaseSession, useWallet } from "@/hooks/use-session";
import { formatCoins } from "@/lib/format";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/market")({
  head: () => ({
    meta: [
      { title: "السوق والتحويلات — التاج" },
      { name: "description", content: "بيع وشراء العناصر المستعملة، تحويل الكوينز للأصدقاء، وأكبر هدية اليوم." },
      { property: "og:title", content: "السوق والتحويلات — التاج" },
      { property: "og:description", content: "سوق المستعمل وتحويل الكوينز بين الأصدقاء." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarketPage,
});

const TABS = [
  { key: "market", label: "السوق" },
  { key: "sell", label: "بيع عناصري" },
  { key: "transfer", label: "تحويل" },
  { key: "top", label: "أكبر هدية" },
] as const;

function MarketPage() {
  const { userId } = useSupabaseSession();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("market");
  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 space-y-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Link to="/me" className="p-1">
              <ArrowRight className="h-5 w-5" />
            </Link>
            <p className="flex-1 text-sm font-bold">السوق والتحويلات</p>
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-2xl bg-surface p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-xl py-2 text-[11px] font-bold",
                  tab === t.key ? "gradient-gold text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>
      }
    >
      <div className="space-y-3 pb-24">
        {userId && tab === "market" && <Listings userId={userId} />}
        {userId && tab === "sell" && <SellMine userId={userId} />}
        {userId && tab === "transfer" && <Transfer userId={userId} />}
        {tab === "top" && <TopGiftToday />}
      </div>
    </AppShell>
  );
}

function Listings({ userId }: { userId: string }) {
  const refresh = useRefreshMoney();
  const q = useQuery({
    queryKey: ["market", "active"],
    queryFn: async () => {
      const { data, error } = await db
        .from("market_listings")
        .select("id, price, seller_id, created_at, store_items(name, image_url, rarity, category), profiles:seller_id(display_name)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });
  const buy = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("market_buy", { _listing_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم الشراء وأضيف العنصر لحقيبتك");
      void q.refetch();
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("market_cancel", { _listing_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void q.refetch(),
  });
  if (q.isLoading) return <p className="py-8 text-center text-xs text-muted-foreground">جارِ التحميل…</p>;
  if (!q.data?.length)
    return <p className="py-8 text-center text-xs text-muted-foreground">لا توجد عروض الآن — كن أول من يبيع</p>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {q.data.map((l) => (
        <div key={l.id} className="surface-card space-y-2 p-3">
          <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl bg-surface">
            {l.store_items?.image_url ? (
              <img src={l.store_items.image_url} alt={l.store_items.name} loading="lazy" className="h-full w-full object-contain" />
            ) : (
              <ShoppingBag className="h-8 w-8 text-primary" />
            )}
          </div>
          <p className="truncate text-xs font-bold">{l.store_items?.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">البائع: {l.profiles?.display_name}</p>
          <p className="text-xs font-black text-primary">{formatCoins(l.price)}</p>
          {l.seller_id === userId ? (
            <Button variant="outline" className="h-8 w-full rounded-xl text-[11px]" onClick={() => cancel.mutate(l.id)}>
              إلغاء العرض
            </Button>
          ) : (
            <Button
              disabled={buy.isPending}
              onClick={() => buy.mutate(l.id)}
              className="h-8 w-full rounded-xl gradient-gold text-[11px] font-bold text-primary-foreground"
            >
              شراء
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function SellMine({ userId }: { userId: string }) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ["my-items-sell", userId],
    queryFn: async () => {
      const { data, error } = await db
        .from("user_items")
        .select("id, is_equipped, expires_at, store_items(name, image_url, price)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });
  const list = useMutation({
    mutationFn: async ({ id, price }: { id: string; price: number }) => {
      const { error } = await db.rpc("market_list", { _user_item_id: id, _price: price });
      if (error) throw new Error(error.message.includes("market_one_active") ? "العنصر معروض بالفعل" : error.message);
    },
    onSuccess: () => toast.success("تم عرض العنصر في السوق"),
    onError: (e: Error) => toast.error(e.message),
  });
  if (!q.data?.length)
    return <p className="py-8 text-center text-xs text-muted-foreground">لا توجد عناصر في حقيبتك</p>;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">تُخصم عمولة 10% من سعر البيع. العنصر يُنقل للمشتري فوراً.</p>
      {q.data.map((it) => (
        <div key={it.id} className="surface-card flex items-center gap-3 p-3">
          <img src={it.store_items?.image_url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl bg-surface object-contain" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold">{it.store_items?.name}</p>
            <input
              inputMode="numeric"
              placeholder={`السعر (الأصلي ${formatCoins(it.store_items?.price ?? 0)})`}
              value={prices[it.id] ?? ""}
              onChange={(e) => setPrices((p) => ({ ...p, [it.id]: e.target.value.replace(/\D/g, "") }))}
              className="mt-1 h-8 w-full rounded-lg bg-surface px-2 text-xs outline-none"
            />
          </div>
          <Button
            disabled={list.isPending || !Number(prices[it.id])}
            onClick={() => list.mutate({ id: it.id, price: Number(prices[it.id]) })}
            className="h-8 shrink-0 rounded-xl gradient-gold px-3 text-[11px] font-bold text-primary-foreground"
          >
            <Tag className="me-1 h-3.5 w-3.5" /> اعرض
          </Button>
        </div>
      ))}
    </div>
  );
}

function Transfer({ userId }: { userId: string }) {
  const wallet = useWallet(userId);
  const refresh = useRefreshMoney();
  const [to, setTo] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const friends = useQuery({
    queryKey: ["friends-transfer", userId],
    queryFn: async () => {
      const { data, error } = await db
        .from("friends")
        .select("friend_id, profiles:friend_id(display_name, public_id)")
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });
  const history = useQuery({
    queryKey: ["tx-history", userId],
    queryFn: async () => {
      const { data, error } = await db
        .from("coin_transactions")
        .select("kind, amount, balance_after, reference, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("transfer_coins", { _to: to, _amount: Number(amount) });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم التحويل");
      setAmount("");
      refresh();
      void history.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const exportCsv = () => {
    const rows = [["التاريخ", "النوع", "المبلغ", "الرصيد بعد", "المرجع", "الحالة"]];
    for (const t of history.data ?? [])
      rows.push([new Date(t.created_at).toLocaleString("ar"), t.kind, t.amount, t.balance_after, t.reference ?? "", t.status]);
    const csv = "\uFEFF" + rows.map((r) => r.map((c: unknown) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "سجل-المحفظة.csv";
    a.click();
  };
  return (
    <div className="space-y-3">
      <section className="surface-card space-y-2 p-4">
        <p className="text-sm font-bold">تحويل كوينز لصديق</p>
        <p className="text-[11px] text-muted-foreground">
          رصيدك: {formatCoins(wallet.data?.coins ?? 0)} — الحد اليومي 1,000,000 — للأصدقاء فقط
        </p>
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {(friends.data ?? []).map((f) => (
            <button
              key={f.friend_id}
              onClick={() => setTo(f.friend_id)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px]",
                to === f.friend_id ? "gradient-gold text-primary-foreground" : "bg-surface",
              )}
            >
              {f.profiles?.display_name}
            </button>
          ))}
          {friends.data?.length === 0 && <p className="text-[11px] text-muted-foreground">أضف أصدقاء أولاً</p>}
        </div>
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          placeholder="المبلغ (الحد الأدنى 100)"
          className="h-10 w-full rounded-xl bg-surface px-3 text-sm outline-none"
        />
        <Button
          disabled={!to || Number(amount) < 100 || send.isPending}
          onClick={() => send.mutate()}
          className="h-10 w-full rounded-2xl gradient-gold font-bold text-primary-foreground"
        >
          <Send className="me-1 h-4 w-4" /> حوّل الآن
        </Button>
      </section>
      <Button variant="outline" onClick={exportCsv} className="h-10 w-full rounded-2xl">
        <Download className="me-1 h-4 w-4" /> تصدير سجل المحفظة (Excel/CSV)
      </Button>
    </div>
  );
}

function TopGiftToday() {
  const q = useQuery({
    queryKey: ["top-gift-today"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data, error } = await db
        .from("gift_transactions")
        .select("id, total_cost, quantity, created_at, gifts(name, image_url), sender:sender_id(display_name), receiver:receiver_id(display_name)")
        .gte("created_at", since.toISOString())
        .order("total_cost", { ascending: false })
        .limit(10);
      if (error) throw new Error(error.message);
      return (data ?? []) as any[];
    },
  });
  if (q.error) return <p className="py-8 text-center text-xs text-muted-foreground">تعذر التحميل</p>;
  if (!q.data?.length) return <p className="py-8 text-center text-xs text-muted-foreground">لا هدايا اليوم بعد</p>;
  return (
    <div className="space-y-2">
      {q.data.map((g, i) => (
        <div key={g.id} className={cn("surface-card flex items-center gap-3 p-3", i === 0 && "border border-primary/60")}>
          <span className="w-6 text-center text-sm font-black text-primary">{i + 1}</span>
          {g.gifts?.image_url ? (
            <img src={g.gifts.image_url} alt="" className="h-10 w-10 object-contain" loading="lazy" />
          ) : (
            <Gift className="h-8 w-8 text-primary" />
          )}
          <div className="min-w-0 flex-1 text-[11px]">
            <p className="truncate font-bold">
              {g.sender?.display_name} ← {g.receiver?.display_name}
            </p>
            <p className="text-muted-foreground">
              {g.gifts?.name} ×{g.quantity}
            </p>
          </div>
          <span className="text-xs font-black text-primary">{formatCoins(g.total_cost)}</span>
        </div>
      ))}
    </div>
  );
}
