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
  Megaphone,
  PartyPopper,
  ScrollText,
  Trash2,
  ShoppingBag,
  Sofa,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { GiftPlayer, GiftThumb, type GiftMediaRow } from "@/components/GiftMedia";
import { uploadGiftMedia, uploadUserImage, resolveMediaUrl, type GiftMediaKind } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsAdmin, useSupabaseSession } from "@/hooks/use-session";
import { listWelcomeClaims, lookupWelcomeUser, sendWelcomePackage } from "@/lib/welcome.functions";
import {
  adminAdjustCoins,
  adminSetSuspended,
  adminSetRoomDisabled,
  adminUpdateRoomDetails,
  adminCreateRoom,
  adminSetRoomModerator,
  adminRemoveRoomMember,
  adminDeleteRoomMessage,
  adminResendRoomMessage,
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
  adminUpsertBadgeDefinition,
  adminEndRelationship,
  adminUpsertBanner,
  adminDeleteBanner,
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
  { key: "roomMessages", label: "رسائل الغرف", icon: ScrollText },
  { key: "banners", label: "البنرات", icon: Megaphone },
  { key: "badges", label: "الشارات", icon: Award },
  { key: "gifts", label: "الهدايا", icon: Gift },
  { key: "store", label: "المتجر", icon: ShoppingBag },
  { key: "vip", label: "VIP", icon: Crown },
  { key: "cvip", label: "SVIP", icon: Gem },
  { key: "coins", label: "الكوينز", icon: Coins },
  { key: "topups", label: "طلبات الشحن", icon: CreditCard },
  { key: "games", label: "الألعاب", icon: Gamepad2 },
  { key: "quiz", label: "الأسئلة", icon: HelpCircle },
  { key: "reports", label: "الإبلاغات", icon: Flag },
  { key: "welcome", label: "الترحيبية", icon: PartyPopper },
  { key: "logs", label: "السجل", icon: ScrollText },
] as const;

function AdminPage() {
  const { userId } = useSupabaseSession();
  const isAdmin = useIsAdmin(userId);
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("users");
  const ownerBadge = useQuery({
    queryKey: ["admin-owner-badge", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_badges")
        .select("id, badge_definitions(name, style_key)")
        .eq("user_id", userId ?? "")
        .eq("badge_definitions.key", "app_owner")
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { id: string; badge_definitions: { name: string; style_key: string } | null } | null;
    },
  });

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
      {ownerBadge.data?.badge_definitions && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-primary/35 bg-primary/10 p-3">
          <AdminBadgeCrest name={ownerBadge.data.badge_definitions.name} styleKey={ownerBadge.data.badge_definitions.style_key} compact />
          <div>
            <p className="text-sm font-black">حساب مالك التطبيق</p>
            <p className="text-[10px] text-muted-foreground">أعلى رتبة موثقة · جميع صلاحيات الإدارة</p>
          </div>
        </div>
      )}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border bg-surface p-3">
          <p className="text-xs font-black">رتبة مساعد</p>
          <p className="mt-1 text-[10px] text-muted-foreground">صلاحيات محددة حسب الشارة، مثل المتابعة أو سحب المشاركين.</p>
        </div>
        <div className="rounded-2xl border border-primary/35 bg-primary/10 p-3">
          <p className="text-xs font-black text-primary">رتبة مسؤول</p>
          <p className="mt-1 text-[10px] text-muted-foreground">سحب المشاركين وتخصيص الغرفة وإغلاق الجولة.</p>
        </div>
      </div>
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
      {tab === "roomMessages" && <RoomMessagesTab />}
      {tab === "banners" && <BannersTab />}
      {tab === "badges" && <BadgeDefinitionsTab />}
      {tab === "gifts" && <GiftsTab />}
      {tab === "store" && <StoreTab />}
      {tab === "vip" && <VipTab />}
      {tab === "cvip" && <CvipTab />}
      {tab === "coins" && <CoinsTab />}
      {tab === "topups" && <TopupsTab />}
      {tab === "games" && <GamesTab />}
      {tab === "quiz" && <QuizTab />}
      {tab === "reports" && <ReportsTab />}
      {tab === "welcome" && <WelcomeTab />}
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
        .select("id, name, description, style_key, sort_order, permissions")
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
                      <span className="mt-1 line-clamp-2 text-[8px] text-muted-foreground">{badge.description}</span>
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

type BadgeDraft = {
  id?: string;
  key: string;
  name: string;
  description: string;
  kind: "administrative" | "achievement";
  imageUrl: string;
  iconKey: string;
  colorKey: string;
  displayVariant: "crest" | "ribbon" | "medal" | "glass";
  audience: "assigned" | "admin" | "moderator" | "host" | "vip" | "all";
  sortOrder: string;
  threshold: string;
  isActive: boolean;
};

const EMPTY_BADGE: BadgeDraft = {
  key: "",
  name: "",
  description: "",
  kind: "administrative",
  imageUrl: "",
  iconKey: "shield",
  colorKey: "royal",
  displayVariant: "crest",
  audience: "assigned",
  sortOrder: "0",
  threshold: "0",
  isActive: true,
};

function BadgeDefinitionsTab() {
  const [form, setForm] = useState<BadgeDraft>(EMPTY_BADGE);
  const query = useQuery({
    queryKey: ["badge-definitions-editor"],
    queryFn: async () => {
      const { data, error } = await supabase.from("badge_definitions")
        .select("id, key, name, description, kind, image_url, icon_key, color_key, display_variant, audience, sort_order, threshold, is_active")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const save = useMutation({
    mutationFn: () => adminUpsertBadgeDefinition({ data: {
      ...(form.id ? { id: form.id } : {}),
      key: form.key.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      kind: form.kind,
      imageUrl: form.imageUrl.trim() || null,
      iconKey: form.iconKey.trim() || "shield",
      colorKey: form.colorKey.trim() || "royal",
      displayVariant: form.displayVariant,
      audience: form.audience,
      sortOrder: Number(form.sortOrder) || 0,
      threshold: Number(form.threshold) || 0,
      isActive: form.isActive,
    } }),
    onSuccess: () => {
      toast.success(form.id ? "تم تعديل الشارة" : "تمت إضافة الشارة");
      setForm(EMPTY_BADGE);
      void query.refetch();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حفظ الشارة"),
  });

  return (
    <div className="space-y-3">
      <div className="surface-card space-y-2 p-3">
        <p className="text-sm font-black">{form.id ? "تعديل الشارة" : "إضافة شارة"}</p>
        <div className="flex justify-center py-2">
          <AdminBadgeCrest name={form.name || "معاينة الشارة"} styleKey={form.colorKey} imageUrl={form.imageUrl || null} variant={form.displayVariant} compact />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="اسم الشارة" className="rounded-xl bg-surface-2" />
          <Input value={form.key} disabled={Boolean(form.id)} onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="badge_key" className="rounded-xl bg-surface-2" />
        </div>
        <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="وصف الشارة" className="rounded-xl bg-surface-2" />
        <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="رابط صورة الشارة (اختياري)" className="rounded-xl bg-surface-2" />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as BadgeDraft["kind"] })} className="h-10 rounded-xl border border-border bg-surface-2 px-2 text-xs">
            <option value="administrative">إدارية</option><option value="achievement">إنجاز</option>
          </select>
          <select value={form.displayVariant} onChange={(e) => setForm({ ...form, displayVariant: e.target.value as BadgeDraft["displayVariant"] })} className="h-10 rounded-xl border border-border bg-surface-2 px-2 text-xs">
            <option value="crest">درع</option><option value="ribbon">وشاح</option><option value="medal">ميدالية</option><option value="glass">زجاجية</option>
          </select>
          <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value as BadgeDraft["audience"] })} className="h-10 rounded-xl border border-border bg-surface-2 px-2 text-xs">
            <option value="assigned">المعيّنون</option><option value="admin">الإدارة</option><option value="moderator">المشرفون</option><option value="host">المضيفون</option><option value="vip">VIP</option><option value="all">الجميع</option>
          </select>
          <Input value={form.colorKey} onChange={(e) => setForm({ ...form, colorKey: e.target.value })} placeholder="نمط اللون" className="rounded-xl bg-surface-2" />
        </div>
        <Button variant="outline" onClick={() => setForm({ ...form, isActive: !form.isActive })} className="w-full rounded-xl">{form.isActive ? "مفعّلة" : "متوقفة"}</Button>
        <div className="flex gap-2">
          <Button disabled={save.isPending || form.name.trim().length < 2 || form.key.length < 2} onClick={() => save.mutate()} className="flex-1 rounded-xl gradient-gold font-bold text-primary-foreground">حفظ الشارة</Button>
          {form.id && <Button variant="outline" onClick={() => setForm(EMPTY_BADGE)} className="rounded-xl">إلغاء</Button>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(query.data ?? []).map((badge) => (
          <button key={badge.id} type="button" onClick={() => setForm({ id: badge.id, key: badge.key, name: badge.name, description: badge.description ?? "", kind: badge.kind as BadgeDraft["kind"], imageUrl: badge.image_url ?? "", iconKey: badge.icon_key, colorKey: badge.color_key, displayVariant: badge.display_variant as BadgeDraft["displayVariant"], audience: badge.audience as BadgeDraft["audience"], sortOrder: String(badge.sort_order), threshold: String(badge.threshold), isActive: badge.is_active })} className="surface-card flex min-h-40 flex-col items-center p-3 text-center">
            <AdminBadgeCrest name={badge.name} styleKey={badge.color_key} imageUrl={badge.image_url} variant={badge.display_variant} compact />
            <span className="mt-2 text-[9px] text-muted-foreground">{badge.kind === "administrative" ? "إدارية" : "إنجاز"} · {badge.is_active ? "مفعلة" : "متوقفة"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type AdminRoomRow = {
  id: string;
  name: string;
  room_code: string;
  member_count: number;
  is_disabled: boolean;
  is_active: boolean;
  image_url: string | null;
  owner_id: string;
};

function AdminRoomImage({ stored, preview }: { stored: string | null; preview: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (preview) {
      setUrl(preview);
      return () => {
        active = false;
      };
    }
    void resolveMediaUrl(stored).then((u) => active && setUrl(u));
    return () => {
      active = false;
    };
  }, [stored, preview]);

  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </div>
  );
}

/** جلب أسماء المستخدمين لقائمة معرّفات (لا توجد علاقة PostgREST مع الملفات) */
async function withProfiles(ids: string[]) {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return [] as { user_id: string; profiles: { display_name: string; public_id: string } | null }[];
  const { data, error } = await supabase.from("profiles").select("id, display_name, public_id").in("id", unique);
  if (error) throw error;
  const map = new Map((data ?? []).map((p) => [p.id, { display_name: p.display_name, public_id: p.public_id }]));
  return unique.map((id) => ({ user_id: id, profiles: map.get(id) ?? null }));
}

/** إنشاء غرفة جديدة من لوحة الإدارة */
function RoomCreateCard({ onCreated }: { onCreated: () => void }) {
  const { userId } = useSupabaseSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("عام");
  const [micCount, setMicCount] = useState("8");
  const [privateRoom, setPrivateRoom] = useState(false);
  const [password, setPassword] = useState("");
  const [ownerPublicId, setOwnerPublicId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      let imageUrl: string | null = null;
      if (file && userId) imageUrl = await uploadUserImage("rooms", userId, file);
      return adminCreateRoom({
        data: {
          name: name.trim(),
          description: null,
          category: category.trim() || "عام",
          roomType: privateRoom ? "private" : "public",
          password: privateRoom && password.trim() ? password.trim() : null,
          micCount: Math.min(20, Math.max(1, Number(micCount) || 8)),
          imageUrl,
          ownerPublicId: ownerPublicId.trim() ? ownerPublicId.trim() : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم إنشاء الغرفة");
      setName("");
      setOwnerPublicId("");
      setPassword("");
      setFile(null);
      setOpen(false);
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إنشاء الغرفة"),
  });

  return (
    <div className="surface-card space-y-2 p-3">
      <Button variant={open ? "outline" : "default"} onClick={() => setOpen(!open)} className="h-10 w-full rounded-xl text-[12px]">
        {open ? "إلغاء إنشاء غرفة" : "إنشاء غرفة جديدة"}
      </Button>
      {open && (
        <div className="space-y-2 border-t border-border/50 pt-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الغرفة" className="h-10 rounded-xl" />
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="التصنيف" className="h-10 rounded-xl" />
          <Input value={micCount} onChange={(e) => setMicCount(e.target.value)} placeholder="عدد المايكات" inputMode="numeric" className="h-10 rounded-xl" />
          <Input value={ownerPublicId} onChange={(e) => setOwnerPublicId(e.target.value)} placeholder="معرّف المالك (اتركه فارغًا لتكون أنت المالك)" className="h-10 rounded-xl" />
          <div className="flex gap-2">
            <Button variant={privateRoom ? "outline" : "default"} onClick={() => setPrivateRoom(false)} className="h-9 flex-1 rounded-xl text-[11px]">
              عامة
            </Button>
            <Button variant={privateRoom ? "default" : "outline"} onClick={() => setPrivateRoom(true)} className="h-9 flex-1 rounded-xl text-[11px]">
              خاصة
            </Button>
          </div>
          {privateRoom && (
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة مرور الغرفة" className="h-10 rounded-xl" />
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-[11px]"
          />
          <Button onClick={() => create.mutate()} disabled={create.isPending || name.trim().length < 2} className="h-10 w-full rounded-xl text-[12px]">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء الغرفة"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** إدارة مشرفي الغرفة والمشاركين فيها */
function RoomTeamPanel({ roomId, ownerId }: { roomId: string; ownerId: string }) {
  const [modId, setModId] = useState("");

  const moderators = useQuery({
    queryKey: ["admin-room-mods", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_moderators").select("user_id").eq("room_id", roomId);
      if (error) throw error;
      return withProfiles((data ?? []).map((r) => r.user_id));
    },
  });

  const members = useQuery({
    queryKey: ["admin-room-members", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_members").select("user_id").eq("room_id", roomId).limit(60);
      if (error) throw error;
      return withProfiles((data ?? []).map((r) => r.user_id));
    },
  });

  const setMod = useMutation({
    mutationFn: async ({ publicId, enable }: { publicId: string; enable: boolean }) =>
      adminSetRoomModerator({ data: { roomId, publicId, enable } }),
    onSuccess: () => {
      toast.success("تم تحديث المشرفين");
      setModId("");
      void moderators.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  const remove = useMutation({
    mutationFn: async (userId: string) => adminRemoveRoomMember({ data: { roomId, userId } }),
    onSuccess: () => {
      toast.success("تم إخراج المشارك");
      void members.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الإخراج"),
  });

  return (
    <div className="space-y-2 border-t border-border/50 pt-3">
      <p className="text-[11px] font-bold">المشرفون</p>
      <div className="flex gap-2">
        <Input value={modId} onChange={(e) => setModId(e.target.value)} placeholder="معرّف المستخدم" className="h-9 flex-1 rounded-xl" />
        <Button
          onClick={() => setMod.mutate({ publicId: modId.trim(), enable: true })}
          disabled={setMod.isPending || modId.trim().length < 3}
          className="h-9 rounded-xl px-3 text-[11px]"
        >
          منح إشراف
        </Button>
      </div>
      {(moderators.data ?? []).map((m) => (
        <div key={m.user_id} className="flex items-center justify-between rounded-xl bg-surface-2 px-2 py-1.5">
          <span className="truncate text-[11px]">
            {m.profiles?.display_name ?? "—"} ({m.profiles?.public_id ?? "—"})
          </span>
          <Button
            variant="outline"
            onClick={() => m.profiles?.public_id && setMod.mutate({ publicId: m.profiles.public_id, enable: false })}
            className="h-7 rounded-lg px-2 text-[10px]"
          >
            سحب
          </Button>
        </div>
      ))}

      <p className="pt-2 text-[11px] font-bold">المشاركون</p>
      {(members.data ?? []).length === 0 && <p className="text-[10px] text-muted-foreground">لا يوجد مشاركون الآن.</p>}
      {(members.data ?? []).map((m) => (
        <div key={m.user_id} className="flex items-center justify-between rounded-xl bg-surface-2 px-2 py-1.5">
          <span className="truncate text-[11px]">
            {m.profiles?.display_name ?? "—"} ({m.profiles?.public_id ?? "—"}) {m.user_id === ownerId ? "· المالك" : ""}
          </span>
          {m.user_id !== ownerId && (
            <Button
              variant="outline"
              onClick={() => remove.mutate(m.user_id)}
              disabled={remove.isPending}
              className="h-7 rounded-lg border-destructive/40 px-2 text-[10px] text-destructive"
            >
              إخراج
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

/** رسائل الغرف: عرض، إعادة إرسال، وحذف */
function RoomMessagesTab() {
  const [roomId, setRoomId] = useState<string>("");

  const rooms = useQuery({
    queryKey: ["admin-msg-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, room_code")
        .order("member_count", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const activeRoom = roomId || rooms.data?.[0]?.id || "";

  const messages = useQuery({
    queryKey: ["admin-room-messages", activeRoom],
    enabled: Boolean(activeRoom),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_messages")
        .select("id, body, kind, created_at, user_id")
        .eq("room_id", activeRoom)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows = (data ?? []) as { id: string; body: string; kind: string; created_at: string; user_id: string }[];
      const people = await withProfiles(rows.map((r) => r.user_id));
      const byId = new Map(people.map((p) => [p.user_id, p.profiles]));
      return rows.map((r) => ({ ...r, profiles: byId.get(r.user_id) ?? null }));
    },
  });

  const remove = useMutation({
    mutationFn: async (messageId: string) => adminDeleteRoomMessage({ data: { messageId } }),
    onSuccess: () => {
      toast.success("تم حذف الرسالة");
      void messages.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحذف"),
  });

  const resend = useMutation({
    mutationFn: async (messageId: string) => adminResendRoomMessage({ data: { messageId } }),
    onSuccess: () => {
      toast.success("تمت إعادة الإرسال");
      void messages.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إعادة الإرسال"),
  });

  return (
    <div className="space-y-3">
      <div className="surface-card space-y-2 p-3">
        <p className="text-[11px] font-bold">اختر الغرفة</p>
        <div className="flex flex-wrap gap-2">
          {(rooms.data ?? []).map((r) => (
            <Button
              key={r.id}
              variant={activeRoom === r.id ? "default" : "outline"}
              onClick={() => setRoomId(r.id)}
              className="h-8 rounded-xl px-3 text-[10px]"
            >
              {r.name} #{r.room_code}
            </Button>
          ))}
        </div>
      </div>

      {messages.isLoading && <div className="h-20 animate-pulse rounded-2xl bg-surface-2" />}
      {messages.isError && <p className="text-[11px] text-destructive">{(messages.error as Error).message}</p>}
      {messages.isSuccess && (messages.data ?? []).length === 0 && <EmptyState title="لا توجد رسائل في هذه الغرفة" />}
      {(messages.data ?? []).map((m) => (
        <div key={m.id} className="surface-card space-y-2 p-3">
          <p className="text-[10px] text-muted-foreground">
            {m.profiles?.display_name ?? "—"} ({m.profiles?.public_id ?? "—"}) ·{" "}
            {new Date(m.created_at).toLocaleString("ar-EG")}
          </p>
          <p className="break-words text-[12px]">{m.body}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => resend.mutate(m.id)}
              disabled={resend.isPending}
              className="h-8 flex-1 rounded-xl text-[10px]"
            >
              إعادة إرسال
            </Button>
            <Button
              variant="outline"
              onClick={() => remove.mutate(m.id)}
              disabled={remove.isPending}
              className="h-8 flex-1 rounded-xl border-destructive/40 text-[10px] text-destructive"
            >
              حذف
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RoomsTab() {
  const { userId } = useSupabaseSession();
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [ownerDraft, setOwnerDraft] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const rooms = useQuery({
    queryKey: ["admin-rooms", onlyActive],
    queryFn: async () => {
      let query = supabase
        .from("rooms")
        .select("id, name, room_code, member_count, is_disabled, is_active, image_url, owner_id")
        .order("member_count", { ascending: false })
        .limit(100);
      if (onlyActive) query = query.eq("is_active", true).eq("is_disabled", false);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AdminRoomRow[];
    },
  });

  const ownerIds = Array.from(new Set((rooms.data ?? []).map((r) => r.owner_id)));
  const owners = useQuery({
    queryKey: ["admin-room-owners", ownerIds.join(",")],
    enabled: ownerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, public_id")
        .in("id", ownerIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const ownerById = new Map((owners.data ?? []).map((o) => [o.id, o]));

  const toggle = useMutation({
    mutationFn: async ({ id, disabled }: { id: string; disabled: boolean }) =>
      adminSetRoomDisabled({ data: { roomId: id, disabled } }),
    onSuccess: () => {
      toast.success("تم التحديث");
      void rooms.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التحديث"),
  });

  const save = useMutation({
    mutationFn: async (room: AdminRoomRow) => {
      let imageUrl = room.image_url;
      if (imageFile && userId) imageUrl = await uploadUserImage("rooms", userId, imageFile);
      return adminUpdateRoomDetails({
        data: {
          roomId: room.id,
          name: nameDraft.trim(),
          imageUrl,
          ownerPublicId: ownerDraft.trim() ? ownerDraft.trim() : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("تم حفظ بيانات الغرفة");
      setEditing(null);
      setImageFile(null);
      setImagePreview(null);
      setOwnerDraft("");
      void rooms.refetch();
      void owners.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  const term = search.trim().toLowerCase();
  const list = (rooms.data ?? []).filter(
    (r) => !term || r.name.toLowerCase().includes(term) || r.room_code.toLowerCase().includes(term),
  );

  function startEdit(room: AdminRoomRow) {
    setEditing(room.id);
    setNameDraft(room.name);
    setOwnerDraft("");
    setImageFile(null);
    setImagePreview(null);
  }

  return (
    <div className="space-y-3">
      <div className="surface-card space-y-2 p-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم الغرفة أو رقمها"
          className="h-10 rounded-xl"
        />
        <div className="flex gap-2">
          <Button
            variant={onlyActive ? "default" : "outline"}
            onClick={() => setOnlyActive(true)}
            className="h-9 flex-1 rounded-xl text-[11px]"
          >
            الغرف النشطة
          </Button>
          <Button
            variant={onlyActive ? "outline" : "default"}
            onClick={() => setOnlyActive(false)}
            className="h-9 flex-1 rounded-xl text-[11px]"
          >
            كل الغرف
          </Button>
        </div>
      </div>

      <RoomCreateCard onCreated={() => void rooms.refetch()} />

      {list.length === 0 && <EmptyState title="لا توجد غرف مطابقة" />}

      {list.map((r) => {
        const owner = ownerById.get(r.owner_id);
        const isEditing = editing === r.id;
        return (
          <div key={r.id} className="surface-card space-y-3 p-3">
            <div className="flex items-center gap-3">
              <AdminRoomImage stored={r.image_url} preview={isEditing ? imagePreview : null} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  #{r.room_code} · {r.member_count} متواجد {r.is_disabled ? "· معطلة" : ""}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  المالك: {owner?.display_name ?? "—"} {owner?.public_id ? `(${owner.public_id})` : ""}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  variant="outline"
                  onClick={() => (isEditing ? setEditing(null) : startEdit(r))}
                  className="h-8 rounded-xl px-3 text-[11px]"
                >
                  {isEditing ? "إلغاء" : "تعديل"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toggle.mutate({ id: r.id, disabled: !r.is_disabled })}
                  className="h-8 rounded-xl px-3 text-[11px]"
                >
                  {r.is_disabled ? "تفعيل" : "تعطيل"}
                </Button>
              </div>
            </div>

            {isEditing && (
              <div className="space-y-2 border-t border-border/50 pt-3">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="اسم الغرفة"
                  className="h-10 rounded-xl"
                />
                <Input
                  value={ownerDraft}
                  onChange={(e) => setOwnerDraft(e.target.value)}
                  placeholder="معرّف المالك الجديد (اترك فارغًا للإبقاء)"
                  className="h-10 rounded-xl"
                />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setImageFile(file);
                    setImagePreview(file ? URL.createObjectURL(file) : null);
                  }}
                  className="w-full text-[11px]"
                />
                <Button
                  onClick={() => save.mutate(r)}
                  disabled={save.isPending || nameDraft.trim().length < 2}
                  className="h-10 w-full rounded-xl text-[12px]"
                >
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ التعديلات"}
                </Button>
                <RoomTeamPanel roomId={r.id} ownerId={r.owner_id} />
              </div>
            )}
          </div>
        );
      })}
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
          label="صورة الهدية (PNG/JPG/WebP/GIF)"
          kind="image"
          accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
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
        <p className="text-sm font-bold">{form.id ? "تعديل خطة SVIP" : "إضافة خطة SVIP"}</p>
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
  const active = useQuery({
    queryKey: ["admin-active-relationships"],
    queryFn: async () => {
      const { data, error } = await supabase.from("relationships")
        .select("id, requester_id, partner_id, type, status, created_at")
        .in("status", ["pending", "accepted"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const ids = [...new Set((data ?? []).flatMap((row) => [row.requester_id, row.partner_id]))];
      if (ids.length === 0) return { rows: data ?? [], names: new Map<string, string>() };
      const profiles = await supabase.from("profiles").select("id, display_name, public_id").in("id", ids);
      if (profiles.error) throw profiles.error;
      return { rows: data ?? [], names: new Map((profiles.data ?? []).map((person) => [person.id, `${person.display_name} · ${person.public_id}`])) };
    },
  });
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
  const forceEnd = useMutation({
    mutationFn: (relationshipId: string) => adminEndRelationship({ data: { relationshipId } }),
    onSuccess: () => { toast.success("تم إنهاء العلاقة وتسجيل الإجراء"); void active.refetch(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إنهاء العلاقة"),
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
      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-2 text-xs font-black">العلاقات والطلبات الحالية</p>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {(active.data?.rows ?? []).map((row) => (
            <div key={row.id} className="rounded-xl bg-surface-2 p-2 text-[10px]">
              <p className="truncate font-bold">{active.data?.names.get(row.requester_id) ?? row.requester_id}</p>
              <p className="truncate text-muted-foreground">مع {active.data?.names.get(row.partner_id) ?? row.partner_id}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span>{relationLabels[row.type]} · {row.status === "accepted" ? "مقبولة" : "معلقة"}</span>
                <Button variant="outline" disabled={forceEnd.isPending} onClick={() => forceEnd.mutate(row.id)} className="h-7 rounded-lg px-2 text-[9px] text-destructive">إنهاء إداري</Button>
              </div>
            </div>
          ))}
          {!active.isLoading && (active.data?.rows.length ?? 0) === 0 && <p className="py-4 text-center text-[10px] text-muted-foreground">لا توجد علاقات حالية</p>}
        </div>
      </div>
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

/* ---------------- بنرات الرئيسية ---------------- */

type BannerAdminRow = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  kind: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  sort_order: number;
};

type BannerDraft = {
  id: string | null;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  linkUrl: string;
  kind: "ad" | "event" | "contest";
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  sortOrder: number;
};

const EMPTY_BANNER: BannerDraft = {
  id: null,
  title: "",
  subtitle: "",
  imageUrl: null,
  linkUrl: "",
  kind: "ad",
  startsAt: "",
  endsAt: "",
  isActive: true,
  sortOrder: 0,
};

function BannerThumb({ stored }: { stored: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void resolveMediaUrl(stored).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [stored]);
  return (
    <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2">
      {src && <img src={src} alt="" className="h-full w-full object-cover" />}
    </div>
  );
}

function BannersTab() {
  const { userId } = useSupabaseSession();
  const [draft, setDraft] = useState<BannerDraft>(EMPTY_BANNER);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const banners = useQuery({
    queryKey: ["admin-banners"],
    queryFn: async () => {
      const db = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            order: (
              c2: string,
              o: { ascending: boolean },
            ) => Promise<{ data: BannerAdminRow[] | null; error: { message: string } | null }>;
          };
        };
      };
      const { data, error } = await db
        .from("banners")
        .select("id, title, subtitle, image_url, link_url, kind, starts_at, ends_at, is_active, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      let imageUrl = draft.imageUrl;
      if (file && userId) imageUrl = await uploadUserImage("rooms", userId, file);
      await adminUpsertBanner({
        data: {
          id: draft.id,
          title: draft.title.trim(),
          subtitle: draft.subtitle.trim() || null,
          imageUrl,
          linkUrl: draft.linkUrl.trim() || null,
          kind: draft.kind,
          startsAt: draft.startsAt || null,
          endsAt: draft.endsAt || null,
          isActive: draft.isActive,
          sortOrder: draft.sortOrder,
        },
      });
    },
    onSuccess: async () => {
      toast.success("تم حفظ البنر");
      setDraft(EMPTY_BANNER);
      setFile(null);
      setPreview(null);
      await banners.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحفظ"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await adminDeleteBanner({ data: { id } });
    },
    onSuccess: async () => {
      toast.success("تم حذف البنر");
      await banners.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر الحذف"),
  });

  return (
    <div className="space-y-4">
      <div className="surface-card space-y-3 p-4">
        <p className="text-sm font-bold">{draft.id ? "تعديل بنر" : "بنر جديد"}</p>
        <Input
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="عنوان البنر"
          className="h-11 rounded-2xl"
        />
        <Input
          value={draft.subtitle}
          onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))}
          placeholder="وصف مختصر (اختياري)"
          className="h-11 rounded-2xl"
        />
        <Input
          value={draft.linkUrl}
          onChange={(e) => setDraft((d) => ({ ...d, linkUrl: e.target.value }))}
          placeholder="رابط عند الضغط (اختياري) مثل /store"
          className="h-11 rounded-2xl"
        />
        <div className="flex gap-2">
          {(
            [
              ["ad", "إعلان"],
              ["event", "حدث"],
              ["contest", "مسابقة"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, kind: key }))}
              className={cn(
                "flex-1 rounded-2xl border px-3 py-2 text-xs font-bold",
                draft.kind === key ? "border-primary/60 gradient-gold text-primary-foreground" : "border-border bg-surface text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            يبدأ
            <Input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
              className="h-11 rounded-2xl"
            />
          </label>
          <label className="space-y-1 text-[11px] text-muted-foreground">
            ينتهي
            <Input
              type="datetime-local"
              value={draft.endsAt}
              onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
              className="h-11 rounded-2xl"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-[11px] text-muted-foreground">
            الترتيب
            <Input
              type="number"
              value={draft.sortOrder}
              onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) || 0 }))}
              className="h-11 rounded-2xl"
            />
          </label>
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, isActive: !d.isActive }))}
            className={cn(
              "mt-5 h-11 rounded-2xl border text-xs font-bold",
              draft.isActive ? "border-primary/60 gradient-gold text-primary-foreground" : "border-border bg-surface text-muted-foreground",
            )}
          >
            {draft.isActive ? "مُفعّل" : "موقوف"}
          </button>
        </div>
        <label className="block space-y-1 text-[11px] text-muted-foreground">
          صورة البنر من ملفات الهاتف
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              setFile(picked);
              setPreview(picked ? URL.createObjectURL(picked) : null);
            }}
            className="w-full rounded-2xl border border-border bg-surface p-2 text-xs"
          />
        </label>
        {preview ? (
          <img src={preview} alt="معاينة" className="h-32 w-full rounded-2xl object-cover" />
        ) : (
          draft.imageUrl && <BannerThumb stored={draft.imageUrl} />
        )}
        <div className="flex gap-2">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || draft.title.trim().length < 2}
            className="h-11 flex-1 rounded-2xl gradient-gold text-primary-foreground"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
          </Button>
          {draft.id && (
            <Button
              variant="outline"
              onClick={() => {
                setDraft(EMPTY_BANNER);
                setFile(null);
                setPreview(null);
              }}
              className="h-11 rounded-2xl"
            >
              إلغاء
            </Button>
          )}
        </div>
      </div>

      {banners.isLoading && <div className="h-20 animate-pulse rounded-2xl bg-surface-2" />}
      {(banners.data ?? []).map((b) => (
        <div key={b.id} className="surface-card flex items-center gap-3 p-3">
          <BannerThumb stored={b.image_url} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{b.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {b.kind === "event" ? "حدث" : b.kind === "contest" ? "مسابقة" : "إعلان"} · ترتيب {b.sort_order} ·{" "}
              {b.is_active ? "مُفعّل" : "موقوف"}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl"
            onClick={() =>
              setDraft({
                id: b.id,
                title: b.title,
                subtitle: b.subtitle ?? "",
                imageUrl: b.image_url,
                linkUrl: b.link_url ?? "",
                kind: (b.kind as BannerDraft["kind"]) ?? "ad",
                startsAt: b.starts_at ? b.starts_at.slice(0, 16) : "",
                endsAt: b.ends_at ? b.ends_at.slice(0, 16) : "",
                isActive: b.is_active,
                sortOrder: b.sort_order,
              })
            }
          >
            تعديل
          </Button>
          <Button size="sm" variant="destructive" className="rounded-xl" onClick={() => remove.mutate(b.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {!banners.isLoading && (banners.data ?? []).length === 0 && (
        <EmptyState title="لا توجد بنرات" hint="أضف بنر إعلان أو حدث أو مسابقة ليظهر أعلى الصفحة الرئيسية" />
      )}
    </div>
  );
}

type WelcomeProfile = {
  id: string;
  public_id: string;
  display_name: string | null;
  avatar_url: string | null;
  vip_level: number | null;
};

type WelcomeClaimRow = {
  id: string;
  user_id: string;
  device_identifier: string | null;
  claimed_at: string;
  status: string;
  video_url: string | null;
  welcome_package: { coins?: number; vip_level?: number; vip_days?: number } | null;
  profile: WelcomeProfile | null;
};

/** لوحة الترحيبية: البحث بالمعرّف، إرسال الهدية مرة واحدة لكل مستخدم وجهاز، وسجل الاستلام. */
function WelcomeTab() {
  const [publicId, setPublicId] = useState("");
  const [device, setDevice] = useState("");
  const [video, setVideo] = useState("");
  const [found, setFound] = useState<{ profile: WelcomeProfile; alreadyClaimed: boolean } | null>(null);

  const claims = useQuery({
    queryKey: ["admin-welcome-claims"],
    queryFn: async () => {
      const res = await listWelcomeClaims({ data: {} });
      return (res.claims ?? []) as unknown as WelcomeClaimRow[];
    },
  });

  const lookup = useMutation({
    mutationFn: async () => lookupWelcomeUser({ data: { publicId: publicId.trim() } }),
    onSuccess: (res) =>
      setFound({ profile: res.profile as unknown as WelcomeProfile, alreadyClaimed: res.alreadyClaimed }),
    onError: (e) => {
      setFound(null);
      toast.error(e instanceof Error ? e.message : "تعذر البحث");
    },
  });

  const send = useMutation({
    mutationFn: async (userId: string) =>
      sendWelcomePackage({
        data: {
          userId,
          ...(device.trim() ? { deviceIdentifier: device.trim() } : {}),
          ...(video.trim() ? { videoUrl: video.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      toast.success("تم إرسال الترحيبية 🎁");
      setFound(null);
      setPublicId("");
      setDevice("");
      await claims.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر إرسال الترحيبية"),
  });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-primary/35 bg-primary/10 p-3">
        <p className="text-xs font-black text-primary">هدية الترحيب</p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          1,000,000,000 كوينز + VIP 3 لمدة 7 أيام + معرّف من 6 أرقام — مرة واحدة فقط لكل مستخدم ولكل جهاز.
        </p>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
        <Input
          value={publicId}
          onChange={(e) => setPublicId(e.target.value)}
          placeholder="معرّف المستخدم (ID)"
          className="h-11 rounded-2xl"
        />
        <Button
          onClick={() => lookup.mutate()}
          disabled={lookup.isPending || publicId.trim().length < 3}
          variant="outline"
          className="h-11 w-full rounded-2xl"
        >
          بحث
        </Button>

        {found && (
          <div className="space-y-2 rounded-2xl border border-border bg-background/50 p-3">
            <div className="flex items-center gap-2">
              <UserAvatar src={found.profile.avatar_url} name={found.profile.display_name} size={36} vipLevel={found.profile.vip_level ?? 0} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black">{found.profile.display_name ?? "مستخدم"}</p>
                <p className="text-[10px] text-muted-foreground">ID: {found.profile.public_id}</p>
              </div>
            </div>
            {found.alreadyClaimed ? (
              <p className="text-[11px] text-destructive">هذا المستخدم استلم الترحيبية بالفعل</p>
            ) : (
              <>
                <Input
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  placeholder="بصمة الجهاز (اختياري)"
                  className="h-10 rounded-2xl"
                />
                <Input
                  value={video}
                  onChange={(e) => setVideo(e.target.value)}
                  placeholder="رابط فيديو الترحيب (اختياري)"
                  className="h-10 rounded-2xl"
                />
                <Button
                  onClick={() => send.mutate(found.profile.id)}
                  disabled={send.isPending}
                  className="h-11 w-full rounded-2xl gradient-gold font-extrabold text-primary-foreground"
                >
                  {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال الترحيبية"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] font-bold text-muted-foreground">سجل الترحيبيات</p>
      {claims.isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (claims.data ?? []).length === 0 ? (
        <EmptyState title="لا توجد ترحيبيات بعد" />
      ) : (
        <div className="space-y-2">
          {(claims.data ?? []).map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-2.5">
              <UserAvatar src={c.profile?.avatar_url} name={c.profile?.display_name} size={32} vipLevel={c.profile?.vip_level ?? 0} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold">{c.profile?.display_name ?? "مستخدم"}</p>
                <p className="text-[10px] text-muted-foreground">
                  ID: {c.profile?.public_id ?? "-"} · {new Date(c.claimed_at).toLocaleString("ar-EG")}
                </p>
              </div>
              <span className="text-[10px] font-extrabold text-primary">
                {(c.welcome_package?.coins ?? 0).toLocaleString("en-US")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
