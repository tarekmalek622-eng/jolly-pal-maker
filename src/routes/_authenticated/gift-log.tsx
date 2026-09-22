import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Gift, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useSupabaseSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/gift-log")({
  head: () => ({
    meta: [
      { title: "سجل الهدايا — التاج" },
      { name: "description", content: "كل الهدايا التي أرسلتها واستلمتها مع القيمة والتاريخ." },
      { property: "og:title", content: "سجل الهدايا — التاج" },
      { property: "og:description", content: "تابع هداياك المرسلة والمستلمة بالتفصيل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GiftLogPage,
});

type Row = {
  id: string;
  quantity: number;
  total_price: number;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  gifts: { name: string; image_url: string | null } | null;
  sender: { public_id: string; display_name: string; avatar_url: string | null } | null;
  receiver: { public_id: string; display_name: string; avatar_url: string | null } | null;
};

function GiftLogPage() {
  const { userId } = useSupabaseSession();
  const [tab, setTab] = useState<"sent" | "received">("sent");

  const rows = useQuery({
    queryKey: ["gift-log", userId, tab],
    enabled: Boolean(userId),
    queryFn: async () => {
      const column = tab === "sent" ? "sender_id" : "receiver_id";
      const { data, error } = await supabase
        .from("gift_transactions")
        .select(
          "id, quantity, total_price, created_at, sender_id, receiver_id, gifts(name, image_url), sender:sender_id(public_id, display_name, avatar_url), receiver:receiver_id(public_id, display_name, avatar_url)",
        )
        .eq(column, userId!)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const total = (rows.data ?? []).reduce((sum, r) => sum + Number(r.total_price ?? 0), 0);

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <Link to="/me" className="p-1" aria-label="رجوع">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-black">سجل الهدايا</h1>
        </header>
      }
    >
      <div className="px-4 pb-10">
        <div className="flex gap-2">
          {(
            [
              { key: "sent", label: "المرسلة" },
              { key: "received", label: "المستلمة" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 rounded-2xl border px-3 py-2 text-[11px] font-bold",
                tab === t.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 bg-surface",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="surface-card mt-3 flex items-center justify-between p-4">
          <span className="text-xs text-muted-foreground">
            {tab === "sent" ? "إجمالي ما أهديته" : "إجمالي ما استلمته"}
          </span>
          <span className="text-sm font-black text-primary">{total.toLocaleString("ar-EG")}</span>
        </div>

        {rows.isLoading && (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}

        {rows.isError && (
          <div className="surface-card mt-4 p-4 text-center">
            <p className="text-sm font-bold">تعذر تحميل السجل</p>
            <button
              type="button"
              onClick={() => void rows.refetch()}
              className="mt-2 rounded-2xl bg-primary/15 px-4 py-2 text-xs font-bold text-primary"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {rows.data && rows.data.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">لا هدايا بعد.</p>
        )}

        <div className="mt-3 space-y-2">
          {(rows.data ?? []).map((r) => {
            const person = tab === "sent" ? r.receiver : r.sender;
            return (
              <div key={r.id} className="surface-card flex items-center gap-3 p-3">
                <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-surface-2">
                  {r.gifts?.image_url ? (
                    <img
                      src={r.gifts.image_url}
                      alt={r.gifts.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Gift className="h-4 w-4 text-primary" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {r.gifts?.name ?? "هدية"} × {r.quantity}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {tab === "sent" ? "إلى" : "من"} {person?.display_name ?? "مستخدم"} ·{" "}
                    {new Date(r.created_at).toLocaleDateString("ar-EG")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-primary">
                    {Number(r.total_price ?? 0).toLocaleString("ar-EG")}
                  </span>
                  {person && (
                    <UserAvatar src={person.avatar_url} name={person.display_name} size={34} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
