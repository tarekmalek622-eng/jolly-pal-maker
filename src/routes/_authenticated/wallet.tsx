import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Coins, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { useSupabaseSession, useWallet } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: "المحفظة — صوتك" },
      { name: "description", content: "رصيد الكوينز، حزم الشحن، وسجل كل عمليات الإرسال والاستلام داخل التطبيق." },
      { property: "og:title", content: "المحفظة — صوتك" },
      { property: "og:description", content: "تابع رصيدك وسجل معاملاتك واشترِ حزم الكوينز." },
    ],
  }),
  component: WalletPage,
});

const KIND_LABEL: Record<string, string> = {
  bonus: "مكافأة",
  gift_sent: "هدية مُرسلة",
  gift_received: "هدية مستلمة",
  purchase: "شراء",
  item_purchase: "شراء عنصر",
  vip: "اشتراك VIP",
  vip_purchase: "اشتراك VIP",
  topup: "شراء كوينز",
  game: "لعبة",
  refund: "استرجاع",
  admin: "تعديل إداري",
  admin_adjust: "تعديل إداري",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "مكتملة",
  pending: "قيد المعالجة",
  failed: "فاشلة",
  refunded: "مسترجعة",
};

function WalletPage() {
  const { userId } = useSupabaseSession();
  const wallet = useWallet(userId);

  const transactions = useQuery({
    queryKey: ["coin-transactions", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coin_transactions")
        .select("id, kind, amount, balance_before, balance_after, reference, status, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const packages = useQuery({
    queryKey: ["coin-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coin_packages")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell header={<PageHeader title="المحفظة" subtitle="رصيدك وسجل معاملاتك" />}>
      <div className="surface-card gradient-gold p-5 text-primary-foreground">
        <p className="text-xs opacity-80">الرصيد الحالي</p>
        <p className="mt-1 flex items-center gap-2 text-4xl font-black">
          <Coins className="h-8 w-8" />
          {(wallet.data?.coins ?? 0).toLocaleString("en-US")}
        </p>
        <div className="mt-4 flex gap-4 text-xs">
          <span>أُرسل: {(wallet.data?.total_sent ?? 0).toLocaleString("en-US")}</span>
          <span>استُلم: {(wallet.data?.total_received ?? 0).toLocaleString("en-US")}</span>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold">حزم الشحن</h2>
        <div className="grid grid-cols-2 gap-3">
          {(packages.data ?? []).map((p) => (
            <div key={p.id} className="surface-card p-4">
              <p className="text-lg font-black text-primary">{p.coins.toLocaleString("en-US")}</p>
              <p className="text-[11px] text-muted-foreground">كوينز</p>
              {p.bonus_coins > 0 && (
                <p className="mt-1 text-[11px] text-success">+{p.bonus_coins.toLocaleString("en-US")} مكافأة</p>
              )}
              <p className="mt-2 text-sm font-bold">
                {(p.price_cents / 100).toFixed(2)} {p.currency}
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground">
                الشراء متاح عند تفعيل بوابة الدفع من الإدارة
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold">سجل المعاملات</h2>
        {transactions.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (transactions.data?.length ?? 0) === 0 ? (
          <EmptyState title="لا توجد معاملات بعد" hint="أرسل هدية أو اشترِ عنصرًا لتظهر هنا" />
        ) : (
          <div className="space-y-2">
            {transactions.data?.map((t) => {
              const positive = t.amount > 0;
              return (
                <div key={t.id} className="surface-card flex items-center gap-3 p-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${positive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                    {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{KIND_LABEL[t.kind] ?? t.kind}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("ar")}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className={`text-sm font-bold ${positive ? "text-success" : "text-destructive"}`}>
                      {positive ? "+" : ""}
                      {t.amount.toLocaleString("en-US")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      الرصيد: {t.balance_after.toLocaleString("en-US")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
