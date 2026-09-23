import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Megaphone, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useIsAdmin, useSupabaseSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/admin-tools")({
  head: () => ({
    meta: [
      { title: "أدوات الإدارة — التاج" },
      { name: "description", content: "رسائل جماعية، تحذيرات، أولوية البلاغات ووضع الصيانة." },
      { property: "og:title", content: "أدوات الإدارة — التاج" },
      { property: "og:description", content: "أدوات إضافية لإدارة التاج." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminTools,
});

const PRI = [
  { k: "urgent", l: "عاجل" },
  { k: "high", l: "مرتفع" },
  { k: "normal", l: "عادي" },
];

function AdminTools() {
  const { userId } = useSupabaseSession();
  const isAdmin = useIsAdmin(userId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [warnId, setWarnId] = useState("");
  const [warnReason, setWarnReason] = useState("");

  const maint = useQuery({
    queryKey: ["maintenance"],
    enabled: Boolean(isAdmin.data),
    queryFn: async () => {
      const { data } = await db.from("app_settings").select("value").eq("key", "maintenance").maybeSingle();
      return (data?.value ?? { on: false, message: "" }) as { on: boolean; message: string };
    },
  });

  const reports = useQuery({
    queryKey: ["reports-priority"],
    enabled: Boolean(isAdmin.data),
    queryFn: async () => {
      const { data, error } = await db
        .from("reports")
        .select("id, reason, details, target_type, priority, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      const order: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
      return ((data ?? []) as any[]).sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2));
    },
  });

  const broadcast = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("admin_broadcast", { _title: title, _body: body });
      if (error) throw new Error(error.message);
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(`أُرسلت لـ ${n} مستخدم`);
      setTitle("");
      setBody("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const warn = useMutation({
    mutationFn: async () => {
      const { data: prof } = await db.from("profiles").select("id").eq("public_id", warnId.trim()).maybeSingle();
      if (!prof) throw new Error("لا يوجد مستخدم بهذا ID");
      const { data, error } = await db.rpc("admin_warn_user", { _user_id: prof.id, _reason: warnReason });
      if (error) throw new Error(error.message);
      return data as number;
    },
    onSuccess: (c) => {
      toast.success(`تم التحذير — إجمالي تحذيراته: ${c}`);
      setWarnReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMaint = async (v: { on: boolean; message: string }) => {
    const { error } = await db.from("app_settings").upsert({ key: "maintenance", value: v });
    if (error) toast.error("تعذر الحفظ");
    else void maint.refetch();
  };

  const setPriority = async (id: string, priority: string) => {
    const { error } = await db.from("reports").update({ priority }).eq("id", id);
    if (error) toast.error("تعذر التحديث");
    else void reports.refetch();
  };

  if (isAdmin.isLoading) return null;
  if (!isAdmin.data)
    return (
      <AppShell>
        <p className="py-16 text-center text-sm text-muted-foreground">هذه الصفحة للإدارة فقط</p>
      </AppShell>
    );

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <Link to="/admin" className="p-1">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <p className="flex-1 text-sm font-bold">أدوات الإدارة</p>
        </header>
      }
    >
      <div className="space-y-3 pb-24">
        <section className="surface-card space-y-2 p-4">
          <p className="flex items-center gap-2 text-sm font-bold"><Megaphone className="h-4 w-4 text-primary" /> رسالة جماعية لكل المستخدمين</p>
          <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="العنوان" className="h-10 w-full rounded-xl bg-surface px-3 text-sm outline-none" />
          <textarea value={body} maxLength={500} onChange={(e) => setBody(e.target.value)} placeholder="نص الرسالة" rows={3} className="w-full rounded-xl bg-surface p-3 text-sm outline-none" />
          <Button disabled={!title.trim() || !body.trim() || broadcast.isPending} onClick={() => broadcast.mutate()} className="h-10 w-full rounded-2xl gradient-gold font-bold text-primary-foreground">إرسال للجميع</Button>
        </section>

        <section className="surface-card space-y-2 p-4">
          <p className="flex items-center gap-2 text-sm font-bold"><AlertTriangle className="h-4 w-4 text-destructive" /> تحذير مستخدم</p>
          <input value={warnId} onChange={(e) => setWarnId(e.target.value)} placeholder="ID المستخدم" className="h-10 w-full rounded-xl bg-surface px-3 text-sm outline-none" />
          <input value={warnReason} maxLength={300} onChange={(e) => setWarnReason(e.target.value)} placeholder="سبب التحذير" className="h-10 w-full rounded-xl bg-surface px-3 text-sm outline-none" />
          <Button disabled={!warnId.trim() || !warnReason.trim() || warn.isPending} onClick={() => warn.mutate()} variant="outline" className="h-10 w-full rounded-2xl">إرسال التحذير</Button>
        </section>

        <section className="surface-card space-y-2 p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-bold"><Wrench className="h-4 w-4 text-primary" /> وضع الصيانة</p>
            <Switch checked={Boolean(maint.data?.on)} onCheckedChange={(on) => void saveMaint({ on, message: maint.data?.message ?? "" })} />
          </div>
          <input
            defaultValue={maint.data?.message ?? ""}
            key={maint.data?.message}
            onBlur={(e) => void saveMaint({ on: Boolean(maint.data?.on), message: e.target.value })}
            placeholder="رسالة الصيانة التي تظهر للمستخدمين"
            className="h-10 w-full rounded-xl bg-surface px-3 text-sm outline-none"
          />
        </section>

        <section className="surface-card space-y-2 p-4">
          <p className="text-sm font-bold">البلاغات المعلّقة حسب الأولوية</p>
          {(reports.data ?? []).length === 0 && <p className="text-[11px] text-muted-foreground">لا توجد بلاغات معلّقة</p>}
          {(reports.data ?? []).map((r) => (
            <div key={r.id} className="space-y-1.5 rounded-2xl bg-surface p-3">
              <p className="text-xs font-bold">{r.reason}</p>
              {r.details && <p className="text-[11px] text-muted-foreground">{r.details}</p>}
              <div className="flex gap-1">
                {PRI.map((x) => (
                  <button key={x.k} onClick={() => void setPriority(r.id, x.k)} className={cn("rounded-full px-2.5 py-0.5 text-[10px]", r.priority === x.k ? (x.k === "urgent" ? "bg-destructive text-destructive-foreground" : "gradient-gold text-primary-foreground") : "bg-background")}>
                    {x.l}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
