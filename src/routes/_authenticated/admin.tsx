import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Coins,
  Award,
  CreditCard,
  Crown,
  Flag,
  Gamepad2,
  Gem,
  Gift,
  HelpCircle,
  Loader2,
  ScrollText,
  ShoppingBag,
  Sofa,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { GiftPlayer, GiftThumb, type GiftMediaRow } from "@/components/GiftMedia";
import { uploadGiftMedia, type GiftMediaKind } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsAdmin, useSupabaseSession } from "@/hooks/use-session";
import {
  adminAdjustCoins,
  adminSetSuspended,
  adminSetRoomDisabled,
  adminResolveReport,
  adminUpsertGift,
  adminDeleteGift,
  adminUpsertStoreItem,
  adminUpsertVipLevel,
  adminUpsertCvipPlan,
  adminUpsertCoinPackage,
  adminSetActive,
  adminDeleteQuizQuestion,
  adminSetGameSettings,
  adminSetWheelSettings,
  adminSetRelationshipSettings,
  adminSetDominoSettings,
  adminReviewCoinPurchase,
  adminSetPaymentAccounts,
  adminUpsertQuizQuestion,
  adminSetUserRole,
  adminSetUserBadge,
  adminUpdateUserIdentity,
} from "@/lib/admin.functions";
import { cn } from "@/lib/utils";
import { AdminBadgeCrest } from "@/components/AdminBadgeCrest";

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
  { key: "users", label: "المستخدمون", icon: Users },
  { key: "rooms", label: "الغرف", icon: Sofa },
  { key: "gifts", label: "الهدايا", icon: Gift },
  { key: "store", label: "المتجر", icon: ShoppingBag },
  { key: "vip", label: "VIP", icon: Crown },
  { key: "cvip", label: "CVIP", icon: Gem },
  { key: "coins", label: "الكوينز", icon: Coins },
  { key: "topups", label: "طلبات الشحن", icon: CreditCard },
  { key: "games", label: "الألعاب", icon: Gamepad2 },
  { key: "quiz", label: "الأسئلة", icon: HelpCircle },
  { key: "reports", label: "الإبلاغات", icon: Flag },
  { key: "logs", label: "السجل", icon: ScrollText },
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
    <AppShell header={<PageHeader title="لوحة الإدارة" subtitle="تحكم كامل بالتطبيق — كل إجراء يُسجَّل" />}>
      <div className="sticky top-0 z-20 -mx-4 mb-4 bg-background/85 px-4 pb-2 pt-1 backdrop-blur-md">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-bold transition-all duration-200 active:scale-95",
                  active
                    ? "border-primary/60 gradient-gold text-primary-foreground shadow-[0_6px_18px_-8px_oklch(0.82_0.16_85/0.9)]"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "users" && <UsersTab />}
      {tab === "rooms" && <RoomsTab />}
      {tab === "gifts" && <GiftsTab />}
      {tab === "store" && <StoreTab />}
      {tab === "vip" && <VipTab />}
      {tab === "cvip" && <CvipTab />}
      {tab === "coins" && <CoinsTab />}
      {tab === "topups" && <TopupsTab />}
      {tab === "games" && <GamesTab />}
      {tab === "quiz" && <QuizTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "logs" && <LogsTab />}
    </AppShell>
  );
}

const ROLES = [
  { key: "admin", label: "إدارة" },
  { key: "moderator", label: "مشرف" },
  { key: "host", label: "مضيف" },
] as const;

function UsersTab() {
  const [term, setTerm] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [idDraft, setIdDraft] = useState<Record<string, string>>({});
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({});
  const [badgeUser, setBadgeUser] = useState<string | null>(null);
  const { userId } = useSupabaseSession();

  const isSuper = useQuery({
    queryKey: ["is-super-admin", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_super_admin", { _user_id: userId! });
      if (error) throw error;
      return data === true;
    },
  });

  const roles = useQuery({
    queryKey: ["admin-roles"],
    enabled: isSuper.data === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data ?? [];
    },
  });

  const setRole = useMutation({
    mutationFn: async (input: { userId: string; role: "admin" | "moderator" | "host"; grant: boolean }) =>
      adminSetUserRole({ data: input }),
    onSuccess: () => {
      toast.success("تم تحديث الصلاحية");
      void roles.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  const badgeDefinitions = useQuery({
    queryKey: ["admin-badge-definitions"],
    enabled: isSuper.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("badge_definitions")
        .select("id, name, style_key, sort_order")
        .eq("kind", "administrative")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const assignedBadges = useQuery({
    queryKey: ["admin-user-badges", badgeUser],
    enabled: Boolean(badgeUser && isSuper.data === true),
    queryFn: async () => {
      if (!badgeUser) return [];
      const { data, error } = await supabase.from("user_badges").select("badge_id").eq("user_id", badgeUser);
      if (error) throw error;
      return (data ?? []).map((row) => row.badge_id);
    },
  });

  const setBadge = useMutation({
    mutationFn: async (input: { userId: string; badgeId: string; grant: boolean }) => adminSetUserBadge({ data: input }),
    onSuccess: () => {
      toast.success("تم تحديث الشارة");
      void assignedBadges.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تحديث الشارة"),
  });

  const users = useQuery({
    queryKey: ["admin-users", term],
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url, vip_level, level, is_suspended")
        .order("created_at", { ascending: false })
        .limit(40);
      const q = term.trim();
      if (q.length >= 2) query = query.or(`display_name.ilike.%${q}%,public_id.ilike.%${q}%`);
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

  const identity = useMutation({
    mutationFn: async (input: { userId: string; publicId?: string; displayName?: string }) =>
      adminUpdateUserIdentity({ data: input }),
    onSuccess: () => {
      toast.success("تم تحديث بيانات الحساب");
      setEditing(null);
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
          <div className="mt-2">
            {editing === u.id ? (
              <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-2">
                <Input
                  value={idDraft[u.id] ?? u.public_id}
                  onChange={(e) => setIdDraft((p) => ({ ...p, [u.id]: e.target.value }))}
                  placeholder="ID الجديد (أرقام فقط)"
                  inputMode="numeric"
                  className="h-10 rounded-xl bg-surface text-xs"
                />
                <Input
                  value={nameDraft[u.id] ?? u.display_name}
                  onChange={(e) => setNameDraft((p) => ({ ...p, [u.id]: e.target.value }))}
                  placeholder="الاسم الجديد"
                  className="h-10 rounded-xl bg-surface text-xs"
                />
                <div className="flex gap-2">
                  <Button
                    disabled={identity.isPending}
                    onClick={() => {
                      const nextId = (idDraft[u.id] ?? u.public_id).trim();
                      const nextName = (nameDraft[u.id] ?? u.display_name).trim();
                      if (!/^[0-9]{4,12}$/.test(nextId)) {
                        toast.error("الـID يجب أن يكون أرقامًا من 4 إلى 12 خانة");
                        return;
                      }
                      if (nextName.length < 2) {
                        toast.error("الاسم قصير جدًا");
                        return;
                      }
                      identity.mutate({ userId: u.id, publicId: nextId, displayName: nextName });
                    }}
                    className="h-10 flex-1 rounded-xl gradient-gold text-[11px] font-bold text-primary-foreground"
                  >
                    {identity.isPending ? "جارٍ الحفظ..." : "حفظ"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditing(null)}
                    className="h-10 rounded-xl px-3 text-[11px]"
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(u.id);
                  setIdDraft((p) => ({ ...p, [u.id]: u.public_id }));
                  setNameDraft((p) => ({ ...p, [u.id]: u.display_name }));
                }}
                className="h-9 w-full rounded-xl text-[11px]"
              >
                تعديل الـID والاسم
              </Button>
            )}
          </div>
          {isSuper.data === true && (
            <div className="mt-2 space-y-2">
            <div className="flex gap-1">
              {ROLES.map((r) => {
                const has = (roles.data ?? []).some((x) => x.user_id === u.id && x.role === r.key);
                return (
                  <Button
                    key={r.key}
                    type="button"
                    variant="ghost"
                    disabled={setRole.isPending}
                    onClick={() => setRole.mutate({ userId: u.id, role: r.key, grant: !has })}
                    className={cn(
                      "flex-1 rounded-xl border px-2 py-2 text-[10px]",
                      has
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-surface-2 text-muted-foreground",
                    )}
                  >
                    {r.label}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              onClick={() => setBadgeUser((current) => current === u.id ? null : u.id)}
              className="h-10 w-full rounded-xl text-[11px]"
            >
              <Award className="me-1.5 h-4 w-4" /> إدارة الشارات الإدارية
            </Button>
            {badgeUser === u.id && (
              <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto rounded-2xl border border-border bg-surface-2 p-2">
                {(badgeDefinitions.data ?? []).map((badge) => {
                  const has = (assignedBadges.data ?? []).includes(badge.id);
                  return (
                    <Button
                      key={badge.id}
                      type="button"
                      variant="ghost"
                      disabled={setBadge.isPending || assignedBadges.isLoading}
                      onClick={() => setBadge.mutate({ userId: u.id, badgeId: badge.id, grant: !has })}
                      className={cn(
                        "h-auto min-h-32 rounded-2xl border p-2",
                        has ? "border-primary bg-primary/10" : "border-border bg-surface",
                      )}
                    >
                      <AdminBadgeCrest name={badge.name} styleKey={badge.style_key} compact />
                    </Button>
                  );
                })}
              </div>
            )}
            </div>
          )}
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

/* ---------------- أدوات مشتركة ---------------- */

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] text-muted-foreground">{label}</span>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-xl bg-surface-2 text-xs"
      />
    </label>
  );
}

function ActiveButton({
  active,
  onToggle,
  busy,
}: {
  active: boolean;
  onToggle: () => void;
  busy?: boolean;
}) {
  return (
    <Button variant="outline" disabled={busy} onClick={onToggle} className="h-9 rounded-xl px-3 text-[11px]">
      {active ? "إخفاء" : "تفعيل"}
    </Button>
  );
}

const RARITIES = ["common", "rare", "epic", "legendary"] as const;

function RaritySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {RARITIES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn(
            "flex-1 rounded-xl border px-2 py-2 text-[10px]",
            value === r ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted-foreground",
          )}
        >
          {r === "common" ? "عادي" : r === "rare" ? "نادر" : r === "epic" ? "أسطوري" : "خارق"}
        </button>
      ))}
    </div>
  );
}

/* ---------------- الهدايا ---------------- */

const GIFT_CATEGORIES = [
  "general",
  "flowers",
  "romantic",
  "love",
  "celebration",
  "occasions",
  "cars",
  "gold",
  "diamond",
  "games",
  "animated",
  "vip",
  "cvip",
] as const;

type GiftForm = {
  id?: string;
  name: string;
  price: string;
  category: string;
  rarity: string;
  sort_order: string;
  duration_ms: string;
  display_scale: string;
  required_vip: string;
  sound_enabled: boolean;
  thumb_url: string;
  animation_url: string;
  video_url: string;
  sound_url: string;
};

const EMPTY_GIFT: GiftForm = {
  name: "",
  price: "1000",
  category: "general",
  rarity: "common",
  sort_order: "0",
  duration_ms: "3000",
  display_scale: "100",
  required_vip: "0",
  sound_enabled: true,
  thumb_url: "",
  animation_url: "",
  video_url: "",
  sound_url: "",
};

function GiftsTab() {
  const [form, setForm] = useState<GiftForm>(EMPTY_GIFT);
  const set = (patch: Partial<GiftForm>) => setForm((f) => ({ ...f, ...patch }));

  const gifts = useQuery({
    queryKey: ["admin-gifts"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("gifts")
        .select(
          "id, name, price, rarity, category, is_active, sort_order, image_url, thumb_url, animation_url, video_url, sound_url, sound_enabled, duration_ms, display_scale, required_vip",
        )
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as (GiftMediaRow & {
        price: number;
        category: string;
        is_active: boolean;
        sort_order: number;
        required_vip: number;
      })[];
    },
  });

  const save = useMutation({
    mutationFn: async () =>
      adminUpsertGift({
        data: {
          ...(form.id ? { id: form.id } : {}),
          name: form.name.trim(),
          price: Number(form.price) || 0,
          category: form.category.trim() || "general",
          rarity: form.rarity as "common",
          thumb_url: form.thumb_url || null,
          image_url: form.thumb_url || null,
          animation_url: form.animation_url || null,
          video_url: form.video_url || null,
          sound_url: form.sound_url || null,
          sound_enabled: form.sound_enabled,
          duration_ms: Math.min(Math.max(Number(form.duration_ms) || 3000, 800), 12000),
          display_scale: Math.min(Math.max(Number(form.display_scale) || 100, 20), 200),
          required_vip: Math.min(Math.max(Number(form.required_vip) || 0, 0), 10),
          is_active: true,
          sort_order: Number(form.sort_order) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ الهدية");
      setForm(EMPTY_GIFT);
      void gifts.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      adminSetActive({ data: { table: "gifts", id, active } }),
    onSuccess: () => void gifts.refetch(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => adminDeleteGift({ data: { id } }),
    onSuccess: (r) => {
      toast.success(r.hidden ? "تم إخفاء الهدية (لها سجل إرسال)" : "تم حذف الهدية");
      void gifts.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحذف"),
  });

  const preview: GiftMediaRow = {
    id: form.id ?? "preview",
    name: form.name || "معاينة",
    image_url: form.thumb_url || null,
    thumb_url: form.thumb_url || null,
    animation_url: form.animation_url || null,
    video_url: form.video_url || null,
    sound_url: form.sound_url || null,
    sound_enabled: form.sound_enabled,
    duration_ms: Number(form.duration_ms) || 3000,
    display_scale: Number(form.display_scale) || 100,
    rarity: form.rarity,
  };

  return (
    <div className="space-y-3">
      <GiftStats />

      <div className="surface-card space-y-2 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">{form.id ? "تعديل هدية" : "إضافة هدية"}</p>
          {form.id ? (
            <button onClick={() => setForm(EMPTY_GIFT)} className="text-[11px] font-bold text-primary">
              هدية جديدة
            </button>
          ) : null}
        </div>

        <Field label="الاسم" value={form.name} onChange={(v) => set({ name: v })} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="السعر" type="number" value={form.price} onChange={(v) => set({ price: v })} />
          <Field label="الترتيب" type="number" value={form.sort_order} onChange={(v) => set({ sort_order: v })} />
        </div>

        <p className="text-[11px] font-bold text-muted-foreground">التصنيف</p>
        <div className="flex flex-wrap gap-1.5">
          {GIFT_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => set({ category: c })}
              className={cn(
                "h-7 rounded-full px-2.5 text-[10px] font-bold",
                form.category === c ? "gradient-gold text-primary-foreground" : "border border-border bg-surface text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <RaritySelect value={form.rarity} onChange={(v) => set({ rarity: v })} />

        <div className="grid grid-cols-3 gap-2">
          <Field label="المدة (ms)" type="number" value={form.duration_ms} onChange={(v) => set({ duration_ms: v })} />
          <Field label="الحجم %" type="number" value={form.display_scale} onChange={(v) => set({ display_scale: v })} />
          <Field label="VIP مطلوب" type="number" value={form.required_vip} onChange={(v) => set({ required_vip: v })} />
        </div>

        <button
          onClick={() => set({ sound_enabled: !form.sound_enabled })}
          className={cn(
            "h-9 w-full rounded-xl text-[11px] font-bold",
            form.sound_enabled ? "gradient-gold text-primary-foreground" : "border border-border bg-surface text-muted-foreground",
          )}
        >
          {form.sound_enabled ? "الصوت مُشغّل" : "الصوت مُوقف"}
        </button>

        <MediaUpload
          label="صورة الهدية (PNG/JPG/WebP)"
          kind="image"
          accept="image/png,image/jpeg,image/webp,image/avif"
          value={form.thumb_url}
          onChange={(v) => set({ thumb_url: v })}
        />
        <MediaUpload
          label="صورة متحركة GIF"
          kind="image"
          accept="image/gif,image/webp"
          value={form.animation_url}
          onChange={(v) => set({ animation_url: v })}
        />
        <MediaUpload
          label="فيديو التأثير (MP4/WebM)"
          kind="video"
          accept="video/mp4,video/webm"
          value={form.video_url}
          onChange={(v) => set({ video_url: v })}
        />
        <MediaUpload
          label="صوت الهدية (اختياري)"
          kind="audio"
          accept="audio/mpeg,audio/wav,audio/ogg"
          value={form.sound_url}
          onChange={(v) => set({ sound_url: v })}
        />

        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2">
          <GiftPlayer gift={preview} muted className="h-20 w-20" />
          <p className="text-[11px] text-muted-foreground">معاينة التأثير كما سيظهر داخل الغرفة</p>
        </div>

        <Button
          disabled={save.isPending || form.name.trim().length < 1}
          onClick={() => save.mutate()}
          className="h-10 w-full rounded-xl gradient-gold text-xs font-bold text-primary-foreground"
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
        </Button>
      </div>

      {gifts.data?.map((g) => (
        <div key={g.id} className="surface-card flex items-center gap-3 p-3">
          <GiftThumb gift={g} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{g.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {g.price} كوينز · {g.category}
              {g.video_url ? " · فيديو" : g.animation_url ? " · GIF" : ""}
              {g.is_active ? "" : " · مخفية"}
            </p>
          </div>
          <button
            onClick={() =>
              setForm({
                id: g.id,
                name: g.name,
                price: String(g.price),
                category: g.category,
                rarity: g.rarity ?? "common",
                sort_order: String(g.sort_order),
                duration_ms: String(g.duration_ms ?? 3000),
                display_scale: String(g.display_scale ?? 100),
                required_vip: String(g.required_vip ?? 0),
                sound_enabled: g.sound_enabled ?? true,
                thumb_url: g.thumb_url ?? g.image_url ?? "",
                animation_url: g.animation_url ?? "",
                video_url: g.video_url ?? "",
                sound_url: g.sound_url ?? "",
              })
            }
            className="h-8 rounded-xl border border-border px-2 text-[10px] font-bold"
          >
            تعديل
          </button>
          <ActiveButton
            active={g.is_active}
            busy={toggle.isPending}
            onToggle={() => toggle.mutate({ id: g.id, active: !g.is_active })}
          />
          <button
            onClick={() => remove.mutate(g.id)}
            disabled={remove.isPending}
            className="h-8 rounded-xl border border-destructive/40 px-2 text-[10px] font-bold text-destructive"
          >
            حذف
          </button>
        </div>
      ))}
    </div>
  );
}

function MediaUpload({
  label,
  kind,
  accept,
  value,
  onChange,
}: {
  label: string;
  kind: GiftMediaKind;
  accept: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [handle, setHandle] = useState<{ cancel: () => void } | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setProgress(0);
    const h = uploadGiftMedia(kind, file, setProgress);
    setHandle(h);
    try {
      const path = await h.promise;
      onChange(path);
      toast.success("تم رفع الملف");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الرفع");
    } finally {
      setProgress(null);
      setHandle(null);
    }
  }

  return (
    <div className="space-y-1 rounded-xl border border-border bg-surface p-2">
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <input
        type="file"
        accept={accept}
        onChange={(e) => void pick(e.target.files?.[0])}
        className="w-full text-[10px]"
      />
      {progress !== null ? (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] font-bold">{progress}%</span>
          <button onClick={() => handle?.cancel()} className="text-[10px] font-bold text-destructive">
            إلغاء
          </button>
        </div>
      ) : null}
      {value ? (
        <div className="flex items-center justify-between">
          <span className="truncate text-[10px] text-muted-foreground">{value}</span>
          <button onClick={() => onChange("")} className="text-[10px] font-bold text-destructive">
            إزالة
          </button>
        </div>
      ) : null}
    </div>
  );
}

const STAT_PERIODS = [
  { key: "day", label: "اليوم", hours: 24 },
  { key: "week", label: "الأسبوع", hours: 24 * 7 },
  { key: "month", label: "الشهر", hours: 24 * 30 },
  { key: "all", label: "الكل", hours: 0 },
] as const;

type GiftStatsData = {
  total_gifts: number;
  total_coins: number;
  top_gifts: { name: string; qty: number; coins: number }[];
  top_senders: { display_name: string; public_id: string; coins: number }[];
  top_receivers: { display_name: string; public_id: string; coins: number }[];
};

function GiftStats() {
  const [period, setPeriod] = useState<(typeof STAT_PERIODS)[number]["key"]>("week");
  const hours = STAT_PERIODS.find((p) => p.key === period)?.hours ?? 0;

  const stats = useQuery<GiftStatsData>({
    queryKey: ["gift-stats", period],
    queryFn: async () => {
      const since = hours > 0 ? new Date(Date.now() - hours * 3600_000).toISOString() : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("gift_stats", { _since: since });
      if (error) throw error;
      return data as GiftStatsData;
    },
  });

  return (
    <div className="surface-card space-y-2 p-3">
      <p className="text-sm font-bold">إحصائيات الهدايا</p>
      <div className="flex gap-1.5">
        {STAT_PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn(
              "h-7 flex-1 rounded-full text-[10px] font-bold",
              period === p.key ? "gradient-gold text-primary-foreground" : "border border-border bg-surface text-muted-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {stats.isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="عدد الهدايا" value={(stats.data?.total_gifts ?? 0).toLocaleString("en-US")} />
            <StatBox label="كوينز الهدايا" value={(stats.data?.total_coins ?? 0).toLocaleString("en-US")} />
          </div>
          <StatList title="أكثر الهدايا" rows={(stats.data?.top_gifts ?? []).map((r) => ({ label: r.name, value: r.coins }))} />
          <StatList
            title="أكثر المرسلين"
            rows={(stats.data?.top_senders ?? []).map((r) => ({ label: r.display_name, value: r.coins }))}
          />
          <StatList
            title="أكثر المستلمين"
            rows={(stats.data?.top_receivers ?? []).map((r) => ({ label: r.display_name, value: r.coins }))}
          />
        </>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface p-2 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-primary">{value}</p>
    </div>
  );
}

function StatList({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-bold text-muted-foreground">{title}</p>
      {rows.slice(0, 5).map((r, i) => (
        <div key={`${r.label}-${i}`} className="flex items-center justify-between rounded-lg bg-surface px-2 py-1 text-[11px]">
          <span className="truncate">
            {i + 1}. {r.label}
          </span>
          <span className="font-bold text-primary">{r.value.toLocaleString("en-US")}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- المتجر ---------------- */

const STORE_CATEGORIES = [
  "profile_frame",
  "profile_background",
  "room_background",
  "room_decoration",
  "mic_decoration",
  "badge",
  "effect",
  "profile_theme",
] as const;

function StoreTab() {
  const [form, setForm] = useState({
    name: "",
    price: "2000",
    category: "profile_frame",
    rarity: "common",
    image_url: "",
    duration_days: "",
    required_vip: "0",
  });

  const items = useQuery({
    queryKey: ["admin-store"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_items")
        .select("id, name, price, category, rarity, is_active, required_vip")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () =>
      adminUpsertStoreItem({
        data: {
          name: form.name.trim(),
          price: Number(form.price),
          category: form.category,
          rarity: form.rarity as "common",
          image_url: form.image_url.trim() || null,
          duration_days: form.duration_days ? Number(form.duration_days) : null,
          required_vip: Number(form.required_vip) || 0,
          is_active: true,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ المنتج");
      setForm({ ...form, name: "", image_url: "" });
      void items.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      adminSetActive({ data: { table: "store_items", id, active } }),
    onSuccess: () => void items.refetch(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  return (
    <div className="space-y-3">
      <div className="surface-card space-y-2 p-3">
        <p className="text-sm font-bold">إضافة منتج</p>
        <Field label="الاسم" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <div className="flex flex-wrap gap-1">
          {STORE_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setForm({ ...form, category: c })}
              className={cn(
                "rounded-full border px-2 py-1 text-[10px]",
                form.category === c
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="السعر" type="number" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
          <Field
            label="أيام (اختياري)"
            type="number"
            value={form.duration_days}
            onChange={(v) => setForm({ ...form, duration_days: v })}
          />
          <Field
            label="VIP مطلوب"
            type="number"
            value={form.required_vip}
            onChange={(v) => setForm({ ...form, required_vip: v })}
          />
        </div>
        <MediaUpload
          label="صورة المنتج من الجهاز (PNG/JPG/WebP)"
          kind="image"
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
          value={form.image_url}
          onChange={(v) => setForm({ ...form, image_url: v })}
        />
        <RaritySelect value={form.rarity} onChange={(v) => setForm({ ...form, rarity: v })} />
        <Button
          disabled={save.isPending || form.name.trim().length < 1}
          onClick={() => save.mutate()}
          className="h-10 w-full rounded-xl gradient-gold text-xs font-bold text-primary-foreground"
        >
          حفظ
        </Button>
      </div>

      {items.data?.map((i) => (
        <div key={i.id} className="surface-card flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{i.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {i.price} كوينز · {i.category} {i.required_vip > 0 ? `· VIP ${i.required_vip}` : ""}
              {i.is_active ? "" : " · مخفي"}
            </p>
          </div>
          <ActiveButton
            active={i.is_active}
            busy={toggle.isPending}
            onToggle={() => toggle.mutate({ id: i.id, active: !i.is_active })}
          />
        </div>
      ))}
    </div>
  );
}

/* ---------------- VIP ---------------- */

function VipTab() {
  const [form, setForm] = useState({ level: "1", name: "", price: "10000", duration_days: "30" });

  const levels = useQuery({
    queryKey: ["admin-vip"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vip_levels")
        .select("level, name, price, duration_days, is_active")
        .order("level");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () =>
      adminUpsertVipLevel({
        data: {
          level: Number(form.level),
          name: form.name.trim(),
          price: Number(form.price),
          duration_days: Number(form.duration_days),
          is_active: true,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ المستوى");
      void levels.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  const toggle = useMutation({
    mutationFn: async ({ level, active }: { level: number; active: boolean }) =>
      adminSetActive({ data: { table: "vip_levels", id: level, active } }),
    onSuccess: () => void levels.refetch(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  return (
    <div className="space-y-3">
      <div className="surface-card space-y-2 p-3">
        <p className="text-sm font-bold">إضافة / تعديل مستوى VIP</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="المستوى" type="number" value={form.level} onChange={(v) => setForm({ ...form, level: v })} />
          <Field label="الاسم" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="السعر" type="number" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
          <Field
            label="المدة (يوم)"
            type="number"
            value={form.duration_days}
            onChange={(v) => setForm({ ...form, duration_days: v })}
          />
        </div>
        <Button
          disabled={save.isPending || form.name.trim().length < 1}
          onClick={() => save.mutate()}
          className="h-10 w-full rounded-xl gradient-gold text-xs font-bold text-primary-foreground"
        >
          حفظ
        </Button>
      </div>

      {levels.data?.map((v) => (
        <div key={v.level} className="surface-card flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              VIP {v.level} — {v.name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {v.price} كوينز · {v.duration_days} يوم {v.is_active ? "" : "· مخفي"}
            </p>
          </div>
          <ActiveButton
            active={v.is_active}
            busy={toggle.isPending}
            onToggle={() => toggle.mutate({ level: v.level, active: !v.is_active })}
          />
        </div>
      ))}
    </div>
  );
}

/* ---------------- CVIP ---------------- */

type CvipPlanRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_days: number;
  sort_order: number;
  badge_url: string | null;
  frame_url: string | null;
  background_url: string | null;
  name_effect: string | null;
  room_effect: string | null;
  is_active: boolean;
};

const emptyCvip = {
  id: "" as string,
  name: "",
  description: "",
  price: "100000",
  duration_days: "30",
  sort_order: "0",
  badge_url: "",
  frame_url: "",
  background_url: "",
  name_effect: "",
  room_effect: "",
};

function CvipTab() {
  const [form, setForm] = useState(emptyCvip);

  const plans = useQuery({
    queryKey: ["admin-cvip"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cvip_plans")
        .select(
          "id, name, description, price, duration_days, sort_order, badge_url, frame_url, background_url, name_effect, room_effect, is_active",
        )
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as CvipPlanRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () =>
      adminUpsertCvipPlan({
        data: {
          id: form.id || undefined,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          price: Number(form.price),
          duration_days: Number(form.duration_days),
          sort_order: Number(form.sort_order),
          badge_url: form.badge_url.trim() || undefined,
          frame_url: form.frame_url.trim() || undefined,
          background_url: form.background_url.trim() || undefined,
          name_effect: form.name_effect.trim() || undefined,
          room_effect: form.room_effect.trim() || undefined,
          is_active: true,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ الخطة");
      setForm(emptyCvip);
      void plans.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      adminSetActive({ data: { table: "cvip_plans", id, active } }),
    onSuccess: () => void plans.refetch(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  return (
    <div className="space-y-3">
      <div className="surface-card space-y-2 p-3">
        <p className="text-sm font-bold">{form.id ? "تعديل خطة CVIP" : "إضافة خطة CVIP"}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="الاسم" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="السعر" type="number" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field
            label="المدة (يوم)"
            type="number"
            value={form.duration_days}
            onChange={(v) => setForm({ ...form, duration_days: v })}
          />
          <Field
            label="الترتيب"
            type="number"
            value={form.sort_order}
            onChange={(v) => setForm({ ...form, sort_order: v })}
          />
        </div>
        <Field label="الوصف" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
        <Field label="رابط الشارة" value={form.badge_url} onChange={(v) => setForm({ ...form, badge_url: v })} />
        <Field label="رابط الإطار" value={form.frame_url} onChange={(v) => setForm({ ...form, frame_url: v })} />
        <Field label="رابط الخلفية" value={form.background_url} onChange={(v) => setForm({ ...form, background_url: v })} />
        <div className="flex gap-2">
          <Button
            disabled={save.isPending || form.name.trim().length < 1}
            onClick={() => save.mutate()}
            className="h-10 flex-1 rounded-xl gradient-gold text-xs font-bold text-primary-foreground"
          >
            حفظ
          </Button>
          {form.id ? (
            <Button
              variant="outline"
              onClick={() => setForm(emptyCvip)}
              className="h-10 rounded-xl border-border bg-surface-2 text-xs"
            >
              إلغاء التعديل
            </Button>
          ) : null}
        </div>
      </div>

      {plans.data?.map((p) => (
        <div key={p.id} className="surface-card flex items-center gap-3 p-3">
          <button
            className="min-w-0 flex-1 text-start"
            onClick={() =>
              setForm({
                id: p.id,
                name: p.name,
                description: p.description ?? "",
                price: String(p.price),
                duration_days: String(p.duration_days),
                sort_order: String(p.sort_order),
                badge_url: p.badge_url ?? "",
                frame_url: p.frame_url ?? "",
                background_url: p.background_url ?? "",
                name_effect: p.name_effect ?? "",
                room_effect: p.room_effect ?? "",
              })
            }
          >
            <p className="truncate text-sm font-semibold">{p.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {p.price} كوينز · {p.duration_days} يوم {p.is_active ? "" : "· مخفية"}
            </p>
          </button>
          <ActiveButton
            active={p.is_active}
            busy={toggle.isPending}
            onToggle={() => toggle.mutate({ id: p.id, active: !p.is_active })}
          />
        </div>
      ))}
    </div>
  );
}

/* ---------------- باقات الكوينز ---------------- */

function CoinsTab() {
  const [form, setForm] = useState({
    name: "",
    coins: "1000",
    bonus_coins: "0",
    price_cents: "999",
    discount_percent: "0",
    sort_order: "0",
  });

  const packages = useQuery({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coin_packages")
        .select("id, name, coins, bonus_coins, price_cents, currency, is_active, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () =>
      adminUpsertCoinPackage({
        data: {
          name: form.name.trim(),
          coins: Number(form.coins),
          bonus_coins: Number(form.bonus_coins) || 0,
          price_cents: Number(form.price_cents),
          currency: "USD",
          discount_percent: Number(form.discount_percent) || 0,
          is_active: true,
          sort_order: Number(form.sort_order) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ الباقة");
      setForm({ ...form, name: "" });
      void packages.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      adminSetActive({ data: { table: "coin_packages", id, active } }),
    onSuccess: () => void packages.refetch(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  return (
    <div className="space-y-3">
      <div className="surface-card space-y-2 p-3">
        <p className="text-sm font-bold">إضافة باقة كوينز</p>
        <Field label="الاسم" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <div className="grid grid-cols-3 gap-2">
          <Field label="الكوينز" type="number" value={form.coins} onChange={(v) => setForm({ ...form, coins: v })} />
          <Field
            label="مكافأة"
            type="number"
            value={form.bonus_coins}
            onChange={(v) => setForm({ ...form, bonus_coins: v })}
          />
          <Field
            label="السعر (سنت)"
            type="number"
            value={form.price_cents}
            onChange={(v) => setForm({ ...form, price_cents: v })}
          />
        </div>
        <Button
          disabled={save.isPending || form.name.trim().length < 1}
          onClick={() => save.mutate()}
          className="h-10 w-full rounded-xl gradient-gold text-xs font-bold text-primary-foreground"
        >
          حفظ
        </Button>
      </div>

      {packages.data?.map((p) => (
        <div key={p.id} className="surface-card flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{p.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {p.coins.toLocaleString("ar")} كوينز {p.bonus_coins > 0 ? `+${p.bonus_coins}` : ""} ·{" "}
              {(p.price_cents / 100).toFixed(2)} {p.currency} {p.is_active ? "" : "· مخفية"}
            </p>
          </div>
          <ActiveButton
            active={p.is_active}
            busy={toggle.isPending}
            onToggle={() => toggle.mutate({ id: p.id, active: !p.is_active })}
          />
        </div>
      ))}
    </div>
  );
}

/* ---------------- إعدادات الألعاب ---------------- */

type GameFlags = { dice: boolean; wheel: boolean; cards: boolean; quiz: boolean; domino: boolean };
type BetLimits = { min_bet: number; max_bet: number };

function GamesTab() {
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("key, value");
      if (error) throw error;
      const map = new Map((data ?? []).map((r) => [r.key, r.value]));
      return {
        games: { dice: true, wheel: true, cards: true, quiz: true, domino: true, ...(map.get("games") as object) } as GameFlags,
        limits: (map.get("limits") ?? { min_bet: 50, max_bet: 5000 }) as BetLimits,
      };
    },
  });

  const [draft, setDraft] = useState<{ games: GameFlags; limits: BetLimits } | null>(null);
  const state = draft ?? settings.data ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!state) return;
      await adminSetGameSettings({ data: { games: state.games, limits: state.limits } });
    },
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات");
      void settings.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  if (!state) return <EmptyState title="جارٍ التحميل" />;

  const labels: Record<keyof GameFlags, string> = {
    dice: "النرد",
    wheel: "عجلة الحظ",
    cards: "الورق",
    quiz: "الأسئلة",
    domino: "دومينو",
  };

  return (
    <div className="surface-card space-y-3 p-3">
      <p className="text-sm font-bold">تشغيل الألعاب</p>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(labels) as (keyof GameFlags)[]).map((k) => (
          <button
            key={k}
            onClick={() => setDraft({ ...state, games: { ...state.games, [k]: !state.games[k] } })}
            className={cn(
              "rounded-xl border px-3 py-2 text-xs",
              state.games[k]
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-surface-2 text-muted-foreground",
            )}
          >
            {labels[k]} {state.games[k] ? "· مفعّلة" : "· موقوفة"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="أقل رهان"
          type="number"
          value={String(state.limits.min_bet)}
          onChange={(v) => setDraft({ ...state, limits: { ...state.limits, min_bet: Number(v) || 0 } })}
        />
        <Field
          label="أعلى رهان"
          type="number"
          value={String(state.limits.max_bet)}
          onChange={(v) => setDraft({ ...state, limits: { ...state.limits, max_bet: Number(v) || 0 } })}
        />
      </div>
      <Button
        disabled={save.isPending}
        onClick={() => save.mutate()}
        className="h-10 w-full rounded-xl gradient-gold text-xs font-bold text-primary-foreground"
      >
        حفظ الإعدادات
      </Button>

      <DominoSettings />
      <WheelSettings />
      <RelationshipSettings />
    </div>
  );
}

type RelationFlags = { couple: boolean; soulmate: boolean; favorite_friend: boolean; close_friend: boolean };

const RELATION_DEFAULTS: RelationFlags = { couple: true, soulmate: true, favorite_friend: true, close_friend: true };

type WheelSlotDraft = { key: string; label: string; emoji: string; multiplier: number; weight: number };
type WheelDraft = {
  enabled: boolean;
  duration_seconds: number;
  result_seconds: number;
  min_bet: number;
  max_bet: number;
  slots: WheelSlotDraft[];
};

const WHEEL_DEFAULTS: WheelDraft = {
  enabled: true,
  duration_seconds: 10,
  result_seconds: 3,
  min_bet: 100,
  max_bet: 100000,
  slots: [],
};

function WheelSettings() {
  const query = useQuery({
    queryKey: ["admin-wheel-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", "wheel").maybeSingle();
      if (error) throw error;
      return { ...WHEEL_DEFAULTS, ...((data?.value as object) ?? {}) } as WheelDraft;
    },
  });
  const [draft, setDraft] = useState<WheelDraft | null>(null);
  const state = draft ?? query.data ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!state) return;
      await adminSetWheelSettings({ data: state });
    },
    onSuccess: () => {
      toast.success("تم حفظ إعدادات العجلة");
      setDraft(null);
      void query.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  if (!state) return null;

  const setSlot = (i: number, patch: Partial<WheelSlotDraft>) =>
    setDraft({ ...state, slots: state.slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });

  return (
    <div className="rounded-2xl border border-border p-3">
      <p className="mb-2 text-sm font-bold">عجلة الحظ المباشرة</p>
      <button
        onClick={() => setDraft({ ...state, enabled: !state.enabled })}
        className={cn(
          "w-full rounded-xl border px-3 py-2 text-xs",
          state.enabled ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted-foreground",
        )}
      >
        {state.enabled ? "اللعبة مفعّلة" : "اللعبة موقوفة"}
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field
          label="مدة الجولة (ثانية)"
          type="number"
          value={String(state.duration_seconds)}
          onChange={(v) => setDraft({ ...state, duration_seconds: Number(v) || 0 })}
        />
        <Field
          label="مدة عرض النتيجة"
          type="number"
          value={String(state.result_seconds)}
          onChange={(v) => setDraft({ ...state, result_seconds: Number(v) || 0 })}
        />
        <Field
          label="أقل رهان"
          type="number"
          value={String(state.min_bet)}
          onChange={(v) => setDraft({ ...state, min_bet: Number(v) || 0 })}
        />
        <Field
          label="أعلى رهان"
          type="number"
          value={String(state.max_bet)}
          onChange={(v) => setDraft({ ...state, max_bet: Number(v) || 0 })}
        />
      </div>

      <p className="mt-3 text-xs font-bold">الخانات ({state.slots.length})</p>
      <div className="mt-2 space-y-2">
        {state.slots.map((s, i) => (
          <div key={`${s.key}-${i}`} className="rounded-xl border border-border p-2">
            <div className="grid grid-cols-4 gap-2">
              <Field label="رمز" value={s.emoji} onChange={(v) => setSlot(i, { emoji: v })} />
              <Field label="الاسم" value={s.label} onChange={(v) => setSlot(i, { label: v })} />
              <Field
                label="المعامل"
                type="number"
                value={String(s.multiplier)}
                onChange={(v) => setSlot(i, { multiplier: Number(v) || 0 })}
              />
              <Field
                label="الوزن"
                type="number"
                value={String(s.weight)}
                onChange={(v) => setSlot(i, { weight: Number(v) || 0.01 })}
              />
            </div>
            <button
              onClick={() => setDraft({ ...state, slots: state.slots.filter((_, idx) => idx !== i) })}
              className="mt-2 text-[11px] text-destructive"
            >
              حذف الخانة
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() =>
          setDraft({
            ...state,
            slots: [
              ...state.slots,
              { key: `slot_${Date.now()}`, label: "خانة جديدة", emoji: "🍀", multiplier: 5, weight: 10 },
            ],
          })
        }
        className="mt-2 w-full rounded-xl border border-dashed border-border py-2 text-xs text-muted-foreground"
      >
        + إضافة خانة
      </button>
      <Button
        disabled={save.isPending}
        onClick={() => save.mutate()}
        className="mt-3 h-10 w-full rounded-xl gradient-gold text-xs font-bold text-primary-foreground"
      >
        حفظ إعدادات العجلة
      </Button>
    </div>
  );
}

function RelationshipSettings() {
  const relationLabels: Record<keyof RelationFlags, string> = {
    couple: "ثنائي مميز",
    soulmate: "توأم روح",
    favorite_friend: "صديق مفضل",
    close_friend: "صديق مقرب",
  };
  const query = useQuery({
    queryKey: ["admin-relationship-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", "relationships").maybeSingle();
      if (error) throw error;
      return { ...RELATION_DEFAULTS, ...((data?.value as object) ?? {}) } as RelationFlags;
    },
  });
  const [draft, setDraft] = useState<RelationFlags | null>(null);
  const state = draft ?? query.data ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!state) return;
      await adminSetRelationshipSettings({ data: state });
    },
    onSuccess: () => {
      toast.success("تم حفظ إعدادات العلاقات");
      setDraft(null);
      void query.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  if (!state) return null;

  return (
    <div className="rounded-2xl border border-border p-3">
      <p className="mb-2 text-sm font-bold">العلاقات الاجتماعية</p>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(relationLabels) as (keyof RelationFlags)[]).map((k) => (
          <button
            key={k}
            onClick={() => setDraft({ ...state, [k]: !state[k] })}
            className={cn(
              "rounded-xl border px-3 py-2 text-xs",
              state[k] ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted-foreground",
            )}
          >
            {relationLabels[k]} {state[k] ? "· مفعّلة" : "· موقوفة"}
          </button>
        ))}
      </div>
      <Button
        disabled={save.isPending}
        onClick={() => save.mutate()}
        className="mt-3 h-10 w-full rounded-xl gradient-gold text-xs font-bold text-primary-foreground"
      >
        حفظ إعدادات العلاقات
      </Button>
    </div>
  );
}

type DominoSettingsState = {
  enabled: boolean;
  min_bet: number;
  max_bet: number;
  payout_multiplier: number;
  refund_hours: number;
};

const DOMINO_DEFAULTS: DominoSettingsState = {
  enabled: true,
  min_bet: 10,
  max_bet: 100000,
  payout_multiplier: 2,
  refund_hours: 24,
};

function DominoSettings() {
  const query = useQuery({
    queryKey: ["admin-domino-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", "domino").maybeSingle();
      if (error) throw error;
      return { ...DOMINO_DEFAULTS, ...((data?.value ?? {}) as object) } as DominoSettingsState;
    },
  });

  const [draft, setDraft] = useState<DominoSettingsState | null>(null);
  const state = draft ?? query.data ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!state) return;
      await adminSetDominoSettings({ data: state });
    },
    onSuccess: () => {
      toast.success("تم حفظ قواعد الدومينو");
      void query.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  if (!state) return null;

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-border bg-surface-2 p-3">
      <p className="text-sm font-bold">قواعد الدومينو والجوائز</p>
      <button
        onClick={() => setDraft({ ...state, enabled: !state.enabled })}
        className={cn(
          "w-full rounded-xl border px-3 py-2 text-xs",
          state.enabled ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted-foreground",
        )}
      >
        {state.enabled ? "الدومينو مفعّل — اضغط للإيقاف" : "الدومينو موقوف — اضغط للتشغيل"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="أقل رهان"
          type="number"
          value={String(state.min_bet)}
          onChange={(v) => setDraft({ ...state, min_bet: Number(v) || 0 })}
        />
        <Field
          label="أعلى رهان"
          type="number"
          value={String(state.max_bet)}
          onChange={(v) => setDraft({ ...state, max_bet: Number(v) || 0 })}
        />
        <Field
          label="مضاعف الجائزة"
          type="number"
          value={String(state.payout_multiplier)}
          onChange={(v) => setDraft({ ...state, payout_multiplier: Number(v) || 1 })}
        />
        <Field
          label="مدة استرداد المتجر (ساعة)"
          type="number"
          value={String(state.refund_hours)}
          onChange={(v) => setDraft({ ...state, refund_hours: Number(v) || 1 })}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        الجائزة = الرهان × المضاعف، وتُحسب في السيرفر مع نقاط الجولة (مجموع قطع الخصم المتبقية).
      </p>
      <Button
        disabled={save.isPending}
        onClick={() => save.mutate()}
        className="h-10 w-full rounded-xl gradient-rose text-xs font-bold text-primary-foreground"
      >
        حفظ قواعد الدومينو
      </Button>
    </div>
  );
}

type QuizRow = {
  id: string;
  question: string;
  choices: unknown;
  correct_index: number;
  difficulty: number | null;
  is_active: boolean;
};

const emptyQuiz = { question: "", choices: ["", "", "", ""], correct: 0, difficulty: "1" };

function QuizTab() {
  const [draft, setDraft] = useState(emptyQuiz);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useQuery({
    queryKey: ["admin-quiz"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("id, question, choices, correct_index, difficulty, is_active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QuizRow[];
    },
  });

  const choicesOf = (raw: unknown): string[] =>
    Array.isArray(raw) ? raw.map((c) => String(c)) : ["", "", "", ""];

  async function save(isActive: boolean) {
    if (draft.question.trim().length < 5 || draft.choices.some((c) => !c.trim())) {
      toast.error("أكمل السؤال والخيارات الأربعة");
      return;
    }
    setBusy(true);
    try {
      await adminUpsertQuizQuestion({
        data: {
          ...(editing ? { id: editing } : {}),
          question: draft.question.trim(),
          choices: draft.choices.map((c) => c.trim()),
          correct_index: draft.correct,
          difficulty: Number(draft.difficulty) || 1,
          is_active: isActive,
        },
      });
      toast.success(editing ? "تم تحديث السؤال" : "تمت إضافة السؤال");
      setDraft(emptyQuiz);
      setEditing(null);
      void list.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await adminDeleteQuizQuestion({ data: { id } });
      toast.success("تم حذف السؤال");
      if (editing === id) {
        setEditing(null);
        setDraft(emptyQuiz);
      }
      void list.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر الحذف");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-3">
        <p className="text-xs font-bold">{editing ? "تعديل سؤال" : "سؤال جديد"}</p>
        <Field label="السؤال" value={draft.question} onChange={(v) => setDraft((d) => ({ ...d, question: v }))} />
        <div className="grid grid-cols-2 gap-2">
          {draft.choices.map((choice, index) => (
            <div key={index} className="space-y-1">
              <Field
                label={`الخيار ${index + 1}`}
                value={choice}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, choices: d.choices.map((c, i) => (i === index ? v : c)) }))
                }
              />
              <button
                onClick={() => setDraft((d) => ({ ...d, correct: index }))}
                className={cn(
                  "w-full rounded-lg border px-2 py-1 text-[10px]",
                  draft.correct === index
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {draft.correct === index ? "الإجابة الصحيحة" : "تعيين كصحيحة"}
              </button>
            </div>
          ))}
        </div>
        <Field
          label="الصعوبة (1-5)"
          type="number"
          value={draft.difficulty}
          onChange={(v) => setDraft((d) => ({ ...d, difficulty: v }))}
        />
        <div className="flex gap-2">
          <Button onClick={() => void save(true)} disabled={busy} className="h-10 flex-1 rounded-xl text-xs">
            {editing ? "حفظ التعديل" : "إضافة ونشر"}
          </Button>
          {editing && (
            <Button
              variant="outline"
              onClick={() => {
                setEditing(null);
                setDraft(emptyQuiz);
              }}
              className="h-10 rounded-xl text-xs"
            >
              إلغاء
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {(list.data ?? []).map((row) => (
          <div key={row.id} className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xs font-bold">{row.question}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              الصحيحة: {choicesOf(row.choices)[row.correct_index] ?? "-"} · صعوبة {row.difficulty ?? 1} ·{" "}
              {row.is_active ? "منشور" : "مخفي"}
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                className="h-9 rounded-xl px-3 text-[11px]"
                onClick={() => {
                  const parsed = choicesOf(row.choices);
                  setEditing(row.id);
                  setDraft({
                    question: row.question,
                    choices: [parsed[0] ?? "", parsed[1] ?? "", parsed[2] ?? "", parsed[3] ?? ""],
                    correct: row.correct_index,
                    difficulty: String(row.difficulty ?? 1),
                  });
                }}
              >
                تعديل
              </Button>
              <ActiveButton
                active={row.is_active}
                busy={busy}
                onToggle={() =>
                  void (async () => {
                    setBusy(true);
                    try {
                      const parsed = choicesOf(row.choices);
                      await adminUpsertQuizQuestion({
                        data: {
                          id: row.id,
                          question: row.question,
                          choices: [parsed[0] ?? "", parsed[1] ?? "", parsed[2] ?? "", parsed[3] ?? ""],
                          correct_index: row.correct_index,
                          difficulty: row.difficulty ?? 1,
                          is_active: !row.is_active,
                        },
                      });
                      void list.refetch();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "تعذر التحديث");
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              />
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void remove(row.id)}
                className="h-9 rounded-xl px-3 text-[11px] text-destructive"
              >
                حذف
              </Button>
            </div>
          </div>
        ))}
        {list.data?.length === 0 && <p className="text-xs text-muted-foreground">لا توجد أسئلة بعد.</p>}
      </div>
    </div>
  );
}

const METHOD_LABEL_AR: Record<string, string> = {
  vodafone_cash: "فودافون كاش",
  instapay: "InstaPay",
};

type TopupRow = {
  id: string;
  user_id: string;
  coins: number;
  amount_cents: number;
  currency: string;
  method: string;
  sender_reference: string;
  status: string;
  note: string | null;
  created_at: string;
};

function TopupsTab() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [accounts, setAccounts] = useState({ vodafone_cash: "", instapay: "", instructions: "" });
  const [loadedAccounts, setLoadedAccounts] = useState(false);

  const settings = useQuery({
    queryKey: ["admin-payment-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", "payment_accounts").maybeSingle();
      if (error) throw error;
      return (data?.value ?? {}) as { vodafone_cash?: string; instapay?: string; instructions?: string };
    },
  });

  useEffect(() => {
    if (settings.data && !loadedAccounts) {
      setAccounts({
        vodafone_cash: settings.data.vodafone_cash ?? "",
        instapay: settings.data.instapay ?? "",
        instructions: settings.data.instructions ?? "",
      });
      setLoadedAccounts(true);
    }
  }, [settings.data, loadedAccounts]);

  const rows = useQuery({
    queryKey: ["admin-topups", status],
    queryFn: async () => {
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (col: string, v: unknown) => {
              order: (col: string, o: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
              };
            };
          };
        };
      };
      const { data, error } = await client
        .from("coin_purchase_requests")
        .select("id, user_id, coins, amount_cents, currency, method, sender_reference, status, note, created_at")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      const list = (data ?? []) as TopupRow[];
      const ids = [...new Set(list.map((r) => r.user_id))];
      if (ids.length === 0) return { list, names: {} as Record<string, string> };
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, public_id").in("id", ids);
      const names: Record<string, string> = {};
      (profiles ?? []).forEach((p) => {
        names[p.id] = `${p.display_name} · ${p.public_id}`;
      });
      return { list, names };
    },
  });

  const review = useMutation({
    mutationFn: (v: { id: string; approve: boolean; note?: string }) => adminReviewCoinPurchase({ data: v }),
    onSuccess: () => {
      toast.success("تم تنفيذ المراجعة");
      void rows.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAccounts = useMutation({
    mutationFn: () => adminSetPaymentAccounts({ data: accounts }),
    onSuccess: () => toast.success("تم حفظ بيانات التحويل"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="surface-card space-y-3 p-4">
        <p className="text-sm font-bold">حسابات التحويل</p>
        <Field label="رقم فودافون كاش" value={accounts.vodafone_cash} onChange={(v) => setAccounts((s) => ({ ...s, vodafone_cash: v }))} />
        <Field label="حساب InstaPay" value={accounts.instapay} onChange={(v) => setAccounts((s) => ({ ...s, instapay: v }))} />
        <Field label="تعليمات للمستخدم" value={accounts.instructions} onChange={(v) => setAccounts((s) => ({ ...s, instructions: v }))} />
        <Button
          disabled={saveAccounts.isPending}
          onClick={() => saveAccounts.mutate()}
          className="h-11 w-full rounded-2xl gradient-gold font-bold text-primary-foreground"
        >
          {saveAccounts.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ بيانات التحويل"}
        </Button>
      </div>

      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs",
              status === s ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted-foreground",
            )}
          >
            {s === "pending" ? "قيد المراجعة" : s === "approved" ? "مؤكدة" : "مرفوضة"}
          </button>
        ))}
      </div>

      {rows.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (rows.data?.list.length ?? 0) === 0 ? (
        <EmptyState title="لا توجد طلبات" hint="ستظهر طلبات شحن الكوينز هنا" />
      ) : (
        <div className="space-y-2">
          {rows.data?.list.map((r) => (
            <div key={r.id} className="surface-card space-y-2 p-3">
              <p className="text-sm font-bold">{rows.data?.names[r.user_id] ?? r.user_id.slice(0, 8)}</p>
              <p className="text-xs text-muted-foreground">
                {r.coins.toLocaleString("en-US")} كوينز · {(r.amount_cents / 100).toFixed(2)} {r.currency} ·{" "}
                {METHOD_LABEL_AR[r.method] ?? r.method}
              </p>
              <p className="text-xs">مرجع التحويل: {r.sender_reference}</p>
              <p className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString("ar")}</p>
              {r.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    disabled={review.isPending}
                    onClick={() => review.mutate({ id: r.id, approve: true })}
                    className="h-10 flex-1 rounded-xl bg-success/20 text-xs font-bold text-success hover:bg-success/30"
                  >
                    تأكيد وإضافة الكوينز
                  </Button>
                  <Button
                    disabled={review.isPending}
                    onClick={() => review.mutate({ id: r.id, approve: false, note: "لم يتم التحقق من التحويل" })}
                    className="h-10 flex-1 rounded-xl bg-destructive/20 text-xs font-bold text-destructive hover:bg-destructive/30"
                  >
                    رفض
                  </Button>
                </div>
              )}
              {r.note ? <p className="text-[11px] text-muted-foreground">ملاحظة: {r.note}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
