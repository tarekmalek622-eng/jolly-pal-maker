import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Coins, MessageCircle, ShieldCheck, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { useIsAdmin, useSupabaseSession } from "@/hooks/use-session";
import agentBadge from "@/assets/agent-badge.png";
import agentFrame from "@/assets/agent-frame.png";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "وكلاء الشحن — التاج" },
      { name: "description", content: "اشحن كوينز التاج عبر وكلاء الشحن المعتمدين." },
      { property: "og:title", content: "وكلاء الشحن — التاج" },
      { property: "og:description", content: "وكلاء شحن معتمدون بإطار وشارة خاصة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgentsPage,
});

const fmt = (n: number) => Number(n ?? 0).toLocaleString("en-US");

function AgentsPage() {
  const { userId } = useSupabaseSession();
  const isAdmin = useIsAdmin(userId);
  const qc = useQueryClient();

  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data, error } = await db
        .from("recharge_agents")
        .select("user_id, balance, total_recharged, is_active, whatsapp")
        .order("total_recharged", { ascending: false });
      if (error) throw error;
      const ids = (data ?? []).map((a: any) => a.user_id);
      const { data: profs } = ids.length
        ? await supabase
            .from("profiles")
            .select("id, public_id, display_name, avatar_url")
            .in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((a: any) => ({ ...a, profile: map.get(a.user_id) }));
    },
  });

  const me = agents.data?.find((a: any) => a.user_id === userId && a.is_active);
  const visible = (agents.data ?? []).filter((a: any) => a.is_active || isAdmin.data);

  const history = useQuery({
    queryKey: ["agent-tx", userId],
    enabled: Boolean(me),
    queryFn: async () => {
      const { data, error } = await db
        .from("agent_transactions")
        .select("id, kind, amount, balance_after, created_at, target_id")
        .eq("agent_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const recharge = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("agent_recharge", {
        _public_id: target.trim(),
        _amount: Number(amount),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("تم الشحن بنجاح");
      setTarget("");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent-tx"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newId, setNewId] = useState("");
  const [newWa, setNewWa] = useState("");
  const setAgent = useMutation({
    mutationFn: async (v: { id: string; active: boolean; wa?: string }) => {
      const { error } = await db.rpc("admin_set_agent", {
        _public_id: v.id,
        _active: v.active,
        _whatsapp: v.wa || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الحفظ");
      setNewId("");
      setNewWa("");
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const verify = useMutation({
    mutationFn: async (x: { id: string; v: boolean }) => {
      const { error } = await db.rpc("admin_set_verified", { _public_id: x.id, _verified: x.v });
      if (error) throw error;
    },
    onSuccess: () => toast.success("تم تحديث التوثيق"),
    onError: (e: Error) => toast.error(e.message),
  });
  const fund = useMutation({
    mutationFn: async (v: { agent: string; amount: number }) => {
      const { error } = await db.rpc("admin_fund_agent", { _agent_id: v.agent, _amount: v.amount });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث رصيد الوكيل");
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4 p-4 pb-28" dir="rtl">
        <div className="flex items-center gap-2">
          <Link to="/me" className="rounded-full bg-foreground/10 p-2">
            <ArrowRight className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-black">وكلاء الشحن</h1>
        </div>

        <div className="surface-card flex items-center gap-3 p-4">
          <img
            src={agentBadge}
            alt="شارة وكيل الشحن"
            width={64}
            height={64}
            className="h-16 w-16"
          />
          <p className="text-xs leading-6 text-muted-foreground">
            تواصل مع أي وكيل معتمد لشحن الكوينز. الوكيل يشحن حسابك مباشرة من رصيده، وتُضاف لك نقاط
            الشحن تلقائياً.
          </p>
        </div>

        {me && (
          <div className="surface-card space-y-3 border border-primary/40 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-sm font-black">
                <ShieldCheck className="h-4 w-4 text-primary" /> لوحة الوكيل
              </span>
              <span className="flex items-center gap-1 text-sm font-black text-warning">
                <Coins className="h-4 w-4" /> {fmt(me.balance)}
              </span>
            </div>
            <Input
              placeholder="ID المستخدم"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <Input
              placeholder="عدد الكوينز"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            />
            <Button
              className="w-full"
              disabled={!target || !Number(amount) || recharge.isPending}
              onClick={() => recharge.mutate()}
            >
              <Zap className="h-4 w-4" /> شحن الآن
            </Button>
            <p className="text-[11px] text-muted-foreground">
              إجمالي ما شحنته: {fmt(me.total_recharged)}
            </p>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {(history.data ?? []).map((t: any) => (
                <div
                  key={t.id}
                  className="flex justify-between rounded-xl bg-foreground/5 px-3 py-2 text-[11px]"
                >
                  <span>{t.kind === "fund" ? "تمويل من الإدارة" : "شحن مستخدم"}</span>
                  <span className={t.kind === "fund" ? "text-success" : "text-warning"}>
                    {t.kind === "fund" ? "+" : "-"}
                    {fmt(Math.abs(t.amount))}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("ar")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isAdmin.data && (
          <div className="surface-card space-y-2 p-4">
            <p className="text-sm font-black">تعيين وكيل جديد</p>
            <Input
              placeholder="ID المستخدم"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
            />
            <Input
              placeholder="واتساب (اختياري)"
              value={newWa}
              onChange={(e) => setNewWa(e.target.value)}
            />
            <Button
              className="w-full"
              disabled={!newId || setAgent.isPending}
              onClick={() => setAgent.mutate({ id: newId.trim(), active: true, wa: newWa.trim() })}
            >
              تعيين كوكيل شحن
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={!newId}
                onClick={() => verify.mutate({ id: newId.trim(), v: true })}
              >
                توثيق الحساب
              </Button>
              <Button
                variant="outline"
                disabled={!newId}
                onClick={() => verify.mutate({ id: newId.trim(), v: false })}
              >
                إلغاء التوثيق
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {agents.isLoading && <div className="h-20 animate-pulse rounded-2xl bg-foreground/10" />}
          {agents.isError && (
            <p className="text-center text-sm text-destructive">تعذر تحميل الوكلاء</p>
          )}
          {!agents.isLoading && visible.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لا يوجد وكلاء شحن حالياً
            </p>
          )}
          {visible.map((a: any) => (
            <div key={a.user_id} className="surface-card flex items-center gap-3 p-3">
              <UserAvatar
                src={a.profile?.avatar_url ?? null}
                name={a.profile?.display_name ?? ""}
                size={52}
                frame={agentFrame}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-sm font-black">
                    {a.profile?.display_name ?? "وكيل"}
                  </span>
                  <img
                    src={agentBadge}
                    alt=""
                    width={18}
                    height={18}
                    className="h-[18px] w-[18px]"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">ID: {a.profile?.public_id}</p>
                {isAdmin.data && (
                  <p className="text-[11px] text-warning">
                    الرصيد {fmt(a.balance)} · {a.is_active ? "مفعّل" : "موقوف"}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {a.whatsapp && (
                  <a
                    href={`https://wa.me/${String(a.whatsapp).replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-1 text-[10px] font-bold text-success"
                  >
                    <MessageCircle className="h-3 w-3" /> تواصل
                  </a>
                )}
                {a.profile?.public_id && (
                  <Link
                    to="/u/$publicId"
                    params={{ publicId: a.profile.public_id }}
                    className="rounded-full bg-primary/15 px-2 py-1 text-center text-[10px] font-bold text-primary"
                  >
                    الملف
                  </Link>
                )}
                {isAdmin.data && (
                  <>
                    <button
                      className="rounded-full bg-warning/20 px-2 py-1 text-[10px] font-bold text-warning"
                      onClick={() => {
                        const v = Number(
                          window.prompt("كم كوينز تضيف لرصيد الوكيل؟ (سالب للخصم)") ?? 0,
                        );
                        if (v) fund.mutate({ agent: a.user_id, amount: v });
                      }}
                    >
                      تمويل
                    </button>
                    <button
                      className="rounded-full bg-destructive/15 px-2 py-1 text-[10px] font-bold text-destructive"
                      onClick={() =>
                        setAgent.mutate({ id: a.profile?.public_id, active: !a.is_active })
                      }
                    >
                      {a.is_active ? "إيقاف" : "تفعيل"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
