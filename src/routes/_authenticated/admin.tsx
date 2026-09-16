import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsAdmin, useSupabaseSession } from "@/hooks/use-session";
import { adminAdjustCoins, adminSetSuspended, adminSetRoomDisabled, adminResolveReport } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "لوحة الإدارة — صوتك" },
      { name: "description", content: "إدارة المستخدمين والغرف والإبلاغات وأرصدة الكوينز مع سجل كامل للإجراءات." },
      { property: "og:title", content: "لوحة الإدارة — صوتك" },
      { property: "og:description", content: "تحكم كامل في المستخدمين والغرف والمحتوى." },
    ],
  }),
  component: AdminPage,
});

const TABS = [
  { key: "users", label: "المستخدمون" },
  { key: "rooms", label: "الغرف" },
  { key: "gifts", label: "الهدايا" },
  { key: "store", label: "المتجر" },
  { key: "vip", label: "VIP" },
  { key: "coins", label: "الكوينز" },
  { key: "games", label: "الألعاب" },
  { key: "reports", label: "الإبلاغات" },
  { key: "logs", label: "السجل" },
] as const;

function AdminPage() {
  const { userId } = useSupabaseSession();
  const isAdmin = useIsAdmin(userId);
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("users");

  useEffect(() => {
    if (isAdmin.isSuccess && !isAdmin.data) {
      toast.error("هذه الصفحة للإدارة فقط");
      void navigate({ to: "/home", replace: true });
    }
  }, [isAdmin.isSuccess, isAdmin.data, navigate]);

  if (isAdmin.isLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell header={<PageHeader title="لوحة الإدارة" subtitle="تحكم كامل بالتطبيق" />}>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs",
              tab === t.key ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab />}
      {tab === "rooms" && <RoomsTab />}
      {tab === "gifts" && <GiftsTab />}
      {tab === "store" && <StoreTab />}
      {tab === "vip" && <VipTab />}
      {tab === "coins" && <CoinsTab />}
      {tab === "games" && <GamesTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "logs" && <LogsTab />}
    </AppShell>
  );
}

function UsersTab() {
  const [term, setTerm] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const users = useQuery({
    queryKey: ["admin-users", term],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url, vip_level, level, is_suspended")
        .order("created_at", { ascending: false })
        .limit(40);
      if (term.trim().length >= 2) query = query.ilike("display_name", `%${term.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const adjust = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) =>
      adminAdjustCoins({ data: { userId: id, amount, reason: "تعديل إداري" } }),
    onSuccess: () => toast.success("تم تعديل الرصيد"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التعديل"),
  });

  const suspend = useMutation({
    mutationFn: async ({ id, suspended }: { id: string; suspended: boolean }) =>
      adminSetSuspended({ data: { userId: id, suspended } }),
    onSuccess: () => {
      toast.success("تم التحديث");
      void users.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  return (
    <div className="space-y-3">
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="ابحث باسم المستخدم"
        className="h-11 rounded-2xl bg-surface"
      />
      {users.data?.map((u) => (
        <div key={u.id} className="surface-card p-3">
          <div className="flex items-center gap-3">
            <UserAvatar src={u.avatar_url} name={u.display_name} size={40} vipLevel={u.vip_level} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{u.display_name}</p>
              <p className="text-[10px] text-muted-foreground">
                ID {u.public_id} · مستوى {u.level} {u.is_suspended ? "· موقوف" : ""}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => suspend.mutate({ id: u.id, suspended: !u.is_suspended })}
              className="h-9 rounded-xl px-3 text-[11px]"
            >
              {u.is_suspended ? "إلغاء الإيقاف" : "إيقاف"}
            </Button>
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={amounts[u.id] ?? ""}
              onChange={(e) => setAmounts((prev) => ({ ...prev, [u.id]: e.target.value }))}
              placeholder="كوينز (+/-)"
              className="h-10 flex-1 rounded-xl bg-surface-2 text-xs"
            />
            <Button
              onClick={() => {
                const amount = Number(amounts[u.id]);
                if (!Number.isFinite(amount) || amount === 0) {
                  toast.error("أدخل قيمة صحيحة");
                  return;
                }
                adjust.mutate({ id: u.id, amount });
                setAmounts((prev) => ({ ...prev, [u.id]: "" }));
              }}
              className="h-10 rounded-xl gradient-gold text-[11px] font-bold text-primary-foreground"
            >
              تعديل الرصيد
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RoomsTab() {
  const rooms = useQuery({
    queryKey: ["admin-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, room_code, member_count, is_disabled")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, disabled }: { id: string; disabled: boolean }) =>
      adminSetRoomDisabled({ data: { roomId: id, disabled } }),
    onSuccess: () => {
      toast.success("تم التحديث");
      void rooms.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  return (
    <div className="space-y-2">
      {rooms.data?.map((r) => (
        <div key={r.id} className="surface-card flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{r.name}</p>
            <p className="text-[10px] text-muted-foreground">
              #{r.room_code} · {r.member_count} متواجد {r.is_disabled ? "· معطلة" : ""}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => toggle.mutate({ id: r.id, disabled: !r.is_disabled })}
            className="h-9 rounded-xl px-3 text-[11px]"
          >
            {r.is_disabled ? "تفعيل" : "تعطيل"}
          </Button>
        </div>
      ))}
    </div>
  );
}

function ReportsTab() {
  const reports = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, target_type, target_id, reason, status, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      adminResolveReport({ data: { reportId: id, status } }),
    onSuccess: () => {
      toast.success("تم تحديث الإبلاغ");
      void reports.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  if ((reports.data?.length ?? 0) === 0) return <EmptyState title="لا توجد إبلاغات" />;

  return (
    <div className="space-y-2">
      {reports.data?.map((r) => (
        <div key={r.id} className="surface-card p-3">
          <p className="text-sm font-semibold">
            {r.target_type === "user" ? "إبلاغ عن مستخدم" : `إبلاغ عن ${r.target_type}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{r.reason}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {new Date(r.created_at).toLocaleString("ar")} · الحالة: {r.status}
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              variant="outline"
              onClick={() => resolve.mutate({ id: r.id, status: "resolved" })}
              className="h-9 flex-1 rounded-xl text-[11px]"
            >
              معالجة
            </Button>
            <Button
              variant="outline"
              onClick={() => resolve.mutate({ id: r.id, status: "rejected" })}
              className="h-9 flex-1 rounded-xl text-[11px]"
            >
              رفض
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function LogsTab() {
  const logs = useQuery({
    queryKey: ["admin-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, actor_id, target_id, action, old_value, new_value, created_at")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data ?? [];
    },
  });

  if ((logs.data?.length ?? 0) === 0) return <EmptyState title="السجل فارغ" />;

  return (
    <div className="space-y-2">
      {logs.data?.map((l) => (
        <div key={l.id} className="surface-card p-3">
          <p className="text-sm font-semibold">{l.action}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString("ar")}</p>
          {(l.old_value || l.new_value) && (
            <p className="mt-1 break-words text-[10px] text-muted-foreground">
              {String(l.old_value ?? "")} → {String(l.new_value ?? "")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
