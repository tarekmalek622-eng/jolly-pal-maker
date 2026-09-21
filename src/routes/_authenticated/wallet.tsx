import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Coins, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createCoinPurchaseRequest } from "@/lib/wallet.functions";
import { useSupabaseSession, useWallet } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { COINS_RATE_NOTE, coinsEgpLabel, coinsUsdLabel } from "@/lib/coins";

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

const METHOD_LABEL: Record<string, string> = {
  vodafone_cash: "فودافون كاش",
  instapay: "InstaPay",
};

const REQUEST_STATUS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "تمت الإضافة",
  rejected: "مرفوض",
};

type PaymentAccounts = { vodafone_cash?: string; instapay?: string; instructions?: string };

type PurchaseRequest = {
  id: string;
  coins: number;
  amount_cents: number;
  currency: string;
  method: string;
  status: string;
  note: string | null;
  created_at: string;
};

type SelectedPackage = { id: string; coins: number; price: number; currency: string };

type SupabaseAny = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        order: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
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

  const settings = useQuery({
    queryKey: ["payment-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "payment_accounts")
        .maybeSingle();
      if (error) throw error;
      return (data?.value ?? {}) as PaymentAccounts;
    },
  });
  const accounts: PaymentAccounts = settings.data ?? {};

  const requests = useQuery({
    queryKey: ["coin-purchase-requests", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as SupabaseAny)
        .from("coin_purchase_requests")
        .select("id, coins, amount_cents, currency, method, status, note, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as PurchaseRequest[];
    },
  });

  const [selected, setSelected] = useState<SelectedPackage | null>(null);
  const [method, setMethod] = useState<"vodafone_cash" | "instapay">("vodafone_cash");
  const [reference, setReference] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await createCoinPurchaseRequest({
        data: { packageId: selected.id, method, senderReference: reference.trim() },
      });
    },
    onSuccess: () => {
      toast.success("تم إرسال الطلب — سيتم تأكيده من الإدارة");
      setSelected(null);
      setReference("");
      void requests.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const supportCoins = (wallet.data as { support_coins?: number } | undefined)?.support_coins ?? 0;
  const [convertAmount, setConvertAmount] = useState("");
  const [mode, setMode] = useState<"topup" | "convert">("topup");

  const cvip = useQuery({
    queryKey: ["cvip-state", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cvip_state");
      if (error) throw new Error(error.message);
      return data as unknown as {
        recharge_points: number;
        level: number;
        next: { level: number; name: string; points: number } | null;
      };
    },
  });


  const convert = useMutation({
    mutationFn: async () => {
      const amount = Math.floor(Number(convertAmount) || 0);
      if (amount <= 0) throw new Error("حدد مبلغًا للاستبدال");
      const { error } = await supabase.rpc("convert_support_balance", { _amount: amount });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم استبدال رصيد الدعم ✅");
      setConvertAmount("");
      void wallet.refetch();
      void transactions.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell header={<PageHeader title="المحفظة" subtitle="رصيدك وسجل معاملاتك" />}>
      <div className="surface-card gradient-gold p-5 text-primary-foreground">
        <p className="text-xs opacity-80">الرصيد الحالي</p>
        <p className="mt-1 flex items-center gap-2 text-4xl font-black">
          <Coins className="h-8 w-8" />
          {(wallet.data?.coins ?? 0).toLocaleString("en-US")}
        </p>
        <p className="mt-1 text-[11px] font-bold opacity-90">
          {coinsEgpLabel(wallet.data?.coins ?? 0)} · {coinsUsdLabel(wallet.data?.coins ?? 0)}
        </p>
        <p className="mt-1 text-[10px] opacity-75">{COINS_RATE_NOTE}</p>
        <div className="mt-4 flex gap-4 text-xs">
          <span>أُرسل: {(wallet.data?.total_sent ?? 0).toLocaleString("en-US")}</span>
          <span>استُلم: {(wallet.data?.total_received ?? 0).toLocaleString("en-US")}</span>
        </div>
      </div>

      <div className="mt-4 flex gap-2 rounded-2xl bg-surface-2 p-1">
        {([
          { key: "topup" as const, label: "شحن" },
          { key: "convert" as const, label: "استبدال" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            className={cn(
              "flex-1 rounded-xl py-2 text-xs font-bold transition-colors",
              mode === t.key ? "gradient-gold text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className={cn("surface-card mt-4 p-4", mode !== "convert" && "hidden")}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">رصيد الدعم</p>
            <p className="text-2xl font-black text-primary">{supportCoins.toLocaleString("en-US")}</p>
          </div>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-[10px] text-muted-foreground">
            حصتك من الهدايا المستلمة
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            type="number"
            inputMode="numeric"
            value={convertAmount}
            onChange={(e) => setConvertAmount(e.target.value)}
            placeholder="المبلغ المطلوب استبداله"
            className="h-11 flex-1 rounded-2xl bg-surface-2"
          />
          <Button
            disabled={convert.isPending || supportCoins <= 0}
            onClick={() => convert.mutate()}
            className="h-11 rounded-2xl gradient-gold px-4 font-bold text-primary-foreground"
          >
            {convert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "استبدال"}
          </Button>
        </div>
        <button
          onClick={() => setConvertAmount(String(supportCoins))}
          className="mt-2 text-[11px] font-bold text-primary"
        >
          استبدال كل الرصيد
        </button>
        <p className="mt-1 text-[10px] text-muted-foreground">
          الاستبدال يحوّل رصيد الدعم إلى رصيد قابل للاستخدام في الهدايا والألعاب والمتجر، وكل عملية تُسجَّل في سجل معاملاتك.
        </p>
      </section>

      <section className={cn("surface-card mt-4 p-4", mode !== "topup" && "hidden")}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">نقاط الشحن</p>
            <p className="text-2xl font-black text-primary">
              {(cvip.data?.recharge_points ?? 0).toLocaleString("en-US")}
            </p>
          </div>
          <span className="rounded-full gradient-gold px-3 py-1 text-[10px] font-bold text-primary-foreground">
            {(cvip.data?.level ?? 0) > 0 ? `CVIP ${cvip.data?.level}` : "بدون CVIP"}
          </span>
        </div>
        {cvip.data?.next ? (
          <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full gradient-gold"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      ((cvip.data.recharge_points ?? 0) / Math.max(1, cvip.data.next.points)) * 100,
                    ),
                  )}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              باقي {Math.max(0, cvip.data.next.points - (cvip.data.recharge_points ?? 0)).toLocaleString("en-US")} نقطة
              للوصول إلى {cvip.data.next.name}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">وصلت إلى أعلى مستوى CVIP 👑</p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">
          كل كوينز تشحنها تُضيف نقطة شحن، وترقية CVIP تتم تلقائيًا عند الوصول للنقاط المطلوبة.
        </p>
      </section>

      <section className={cn("mt-6", mode !== "topup" && "hidden")}>

        <h2 className="mb-1 text-sm font-bold">حزم الشحن</h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          حوّل المبلغ على {accounts.vodafone_cash ? `فودافون كاش ${accounts.vodafone_cash}` : "فودافون كاش"}
          {accounts.instapay ? ` أو InstaPay ${accounts.instapay}` : " أو InstaPay"}، ثم أرسل رقم عملية التحويل ليتم
          تأكيد الشحن من الإدارة.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(packages.data ?? []).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelected({ id: p.id, coins: p.coins + (p.bonus_coins ?? 0), price: p.price_cents, currency: p.currency });
                setReference("");
              }}
              className="surface-card p-4 text-start"
            >
              <p className="text-lg font-black text-primary">{p.coins.toLocaleString("en-US")}</p>
              <p className="text-[11px] text-muted-foreground">كوينز</p>
              {p.bonus_coins > 0 && (
                <p className="mt-1 text-[11px] text-success">+{p.bonus_coins.toLocaleString("en-US")} مكافأة</p>
              )}
              <p className="mt-2 text-sm font-bold">
                {(p.price_cents / 100).toFixed(2)} {p.currency}
              </p>
              <p className="mt-2 text-[10px] text-primary">اطلب الشحن</p>
            </button>
          ))}
        </div>
      </section>

      {mode === "topup" && (requests.data ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold">طلبات الشحن</h2>
          <div className="space-y-2">
            {requests.data?.map((r) => (
              <div key={r.id} className="surface-card flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{r.coins.toLocaleString("en-US")} كوينز</p>
                  <p className="text-[11px] text-muted-foreground">
                    {METHOD_LABEL[r.method] ?? r.method} · {(r.amount_cents / 100).toFixed(2)} {r.currency} ·{" "}
                    {new Date(r.created_at).toLocaleString("ar")}
                  </p>
                  {r.note ? <p className="text-[11px] text-muted-foreground">{r.note}</p> : null}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-1 text-[10px] font-bold",
                    r.status === "approved"
                      ? "bg-success/15 text-success"
                      : r.status === "rejected"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {REQUEST_STATUS[r.status] ?? r.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>طلب شحن كوينز</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="space-y-3 pb-6">
              <div className="surface-card p-3 text-sm">
                <p className="font-bold text-primary">{selected.coins.toLocaleString("en-US")} كوينز</p>
                <p className="text-[11px] text-muted-foreground">
                  المبلغ المطلوب: {(selected.price / 100).toFixed(2)} {selected.currency}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["vodafone_cash", "instapay"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-xs",
                      method === m
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-surface-2 text-muted-foreground",
                    )}
                  >
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
              <p className="rounded-xl bg-surface-2 p-3 text-[11px] text-muted-foreground">
                {method === "vodafone_cash"
                  ? accounts.vodafone_cash
                    ? `حوّل على رقم فودافون كاش: ${accounts.vodafone_cash}`
                    : "لم تُضف الإدارة رقم فودافون كاش بعد"
                  : accounts.instapay
                    ? `حوّل على InstaPay: ${accounts.instapay}`
                    : "لم تُضف الإدارة حساب InstaPay بعد"}
                {accounts.instructions ? ` — ${accounts.instructions}` : ""}
              </p>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="رقم عملية التحويل أو الرقم المُحوّل منه"
                className="h-12 rounded-2xl bg-surface-2"
              />
              <Button
                disabled={submit.isPending || reference.trim().length < 4}
                onClick={() => submit.mutate()}
                className="h-12 w-full rounded-2xl gradient-gold font-bold text-primary-foreground"
              >
                {submit.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "إرسال الطلب للإدارة"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

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
                    <p className="text-sm font-semibold">
                      {KIND_LABEL[t.kind] ?? t.kind}
                      {t.reference ? <span className="text-[11px] text-muted-foreground"> · {t.reference}</span> : null}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {new Date(t.created_at).toLocaleString("ar")} · {STATUS_LABEL[t.status] ?? t.status}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground/70">رقم العملية: {t.id.slice(0, 8)}</p>
                  </div>
                  <div className="text-end">
                    <p className={`text-sm font-bold ${positive ? "text-success" : "text-destructive"}`}>
                      {positive ? "+" : ""}
                      {t.amount.toLocaleString("en-US")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      قبل: {t.balance_before.toLocaleString("en-US")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      بعد: {t.balance_after.toLocaleString("en-US")}
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
