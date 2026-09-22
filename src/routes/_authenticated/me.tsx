import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Backpack,
  BarChart3,
  BookOpen,
  Camera,
  Coins,
  Crown,
  LifeBuoy,
  ListChecks,
  LogOut,
  Pencil,
  Search,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { AppShell, PageHeader } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { VipName, VipId } from "@/components/VipName";
import { VipCvipSheet } from "@/components/VipCvipSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CosmeticImage } from "@/components/RoomCosmetics";
import {
  useAdminSections,
  useIsAdmin,
  useMyProfile,
  useSupabaseSession,
  useWallet,
} from "@/hooks/use-session";
import { uploadUserImage } from "@/lib/media";
import { screenProfilePhoto } from "@/lib/moderation.functions";
import { clearDeviceCredentials } from "@/lib/device-account";
import { levelProgress } from "@/lib/levels";
import { adminSectionLabel } from "@/lib/admin-sections";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { ProfileShowcase } from "@/components/ProfileShowcase";
import { RelationshipShowcase } from "@/components/RelationshipShowcase";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({
    meta: [
      { title: "ملفي — التاج" },
      {
        name: "description",
        content: "عدّل اسمك وصورتك ونبذتك، وتابع مستواك وXP وVIP وعناصرك المملوكة.",
      },
      { property: "og:title", content: "ملفي — التاج" },
      { property: "og:description", content: "مستواك، رصيدك، عناصرك، وإعدادات حسابك." },
    ],
  }),
  component: MePage,
});

function MePage() {
  const { userId } = useSupabaseSession();
  const profile = useMyProfile(userId);
  const wallet = useWallet(userId);
  const isAdmin = useIsAdmin(userId);
  const adminSections = useAdminSections(userId);
  const canOpenAdmin = Boolean(isAdmin.data) || (adminSections.data ?? []).length > 0;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [statusText, setStatusText] = useState("");
  const [nameColor, setNameColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [privSheet, setPrivSheet] = useState<"vip" | "cvip" | null>(null);
  const [bagOpen, setBagOpen] = useState(false);

  const counts = useQuery({
    queryKey: ["social-counts", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [followers, following, friends] = await Promise.all([
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", userId!),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", userId!),
        supabase.from("friends").select("*", { count: "exact", head: true }).eq("user_id", userId!),
      ]);
      return {
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        friends: friends.count ?? 0,
      };
    },
  });

  const myItems = useQuery({
    queryKey: ["my-items-detail", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_items")
        .select("id, is_equipped, expires_at, store_items(name, category, image_url)")
        .eq("user_id", userId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const visitors = useQuery({
    queryKey: ["profile-visitors", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profile_visits")
        .select(
          "visitor_id, updated_at, profiles:visitor_id(public_id, display_name, avatar_url, frame_url, vip_level)",
        )
        .eq("profile_id", userId!)
        .order("updated_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [equipping, setEquipping] = useState<string | null>(null);
  const [bagTab, setBagTab] = useState<string>("all");

  async function toggleEquip(userItemId: string, equip: boolean) {
    setEquipping(userItemId);
    const { error } = await supabase.rpc("equip_item", {
      _user_item_id: userItemId,
      _equip: equip,
    });
    setEquipping(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    void myItems.refetch();
    void profile.refetch();
  }

  async function saveProfile() {
    if (!userId) return;
    if (name.trim().length < 2) {
      toast.error("الاسم قصير جدًا");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name.trim(),
        bio: bio.trim(),
        status_text: statusText.trim() || null,
        name_color: nameColor || null,
      })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast.error("تعذر الحفظ");
      return;
    }
    toast.success("تم تحديث ملفك");
    setEditing(false);
    void qc.invalidateQueries({ queryKey: ["profile"] });
  }

  async function changePhoto(file: File) {
    if (!userId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختر صورة صحيحة");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة كبير، اختر صورة أصغر من 5 ميجابايت");
      return;
    }
    toast.info("جارٍ فحص الصورة...");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      const verdict = await screenProfilePhoto({ data: { imageDataUrl: dataUrl } });
      if (!verdict.allowed) {
        toast.error(verdict.reason ?? "الصورة مرفوضة");
        return;
      }
      const path = await uploadUserImage("avatars", userId, file);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", userId);
      if (error) throw error;
      toast.success("تم تحديث صورتك");
      void qc.invalidateQueries({ queryKey: ["profile"] });
    } catch {
      toast.error("تعذر تحديث الصورة");
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    clearDeviceCredentials();
    await supabase.auth.signOut();
    void navigate({ to: "/", replace: true });
  }

  const p = profile.data;
  const progress = levelProgress(p?.xp ?? 0);

  return (
    <AppShell header={<PageHeader title="ملفي" />}>
      <div className="surface-card p-5">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => fileRef.current?.click()} className="relative">
            <UserAvatar
              src={p?.avatar_url}
              name={p?.display_name}
              size={72}
              vipLevel={p?.vip_level ?? 0}
              frame={p?.frame_url}
            />
            <span className="absolute -bottom-1 -end-1 flex h-7 w-7 items-center justify-center rounded-full gradient-gold">
              <Camera className="h-3.5 w-3.5 text-primary-foreground" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void changePhoto(f);
              e.target.value = "";
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="تعديل الملف"
                onClick={() => {
                  setName(p?.display_name ?? "");
                  setBio(p?.bio ?? "");
                  setStatusText(p?.status_text ?? "");
                  setNameColor(p?.name_color ?? "");
                  setEditing((v) => !v);
                }}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                  editing
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-surface-2 text-muted-foreground",
                )}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <VipName
                name={p?.display_name ?? "..."}
                vipLevel={p?.vip_level ?? 0}
                color={p?.name_color}
                className="block min-w-0 truncate text-lg"
              />
            </div>
            <VipId publicId={p?.public_id ?? "—"} vipLevel={p?.vip_level ?? 0} />
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px]">
                مستوى {progress.level}
              </span>
              {(p?.vip_level ?? 0) > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                  <Crown className="h-3 w-3" /> VIP {p?.vip_level}
                </span>
              )}
              {p?.is_cvip && (
                <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent">
                  <Sparkles className="h-3 w-3" /> SVIP
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full gradient-gold" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            الخبرة {progress.intoLevel.toLocaleString("en-US")} /{" "}
            {progress.needed.toLocaleString("en-US")} للمستوى {progress.level + 1} · بلا حد أقصى
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["المتابعون", counts.data?.followers ?? 0],
            ["يتابع", counts.data?.following ?? 0],
            ["الأصدقاء", counts.data?.friends ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl bg-surface-2 py-3">
              <p className="text-base font-bold">{String(value)}</p>
              <p className="text-[10px] text-muted-foreground">{String(label)}</p>
            </div>
          ))}
        </div>

        {/* تفعيل مميزات VIP و SVIP */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPrivSheet("vip")}
            className={cn(
              "flex items-center gap-2 rounded-2xl border p-3 text-start transition-transform active:scale-[0.98]",
              `vip-tier-${Math.max(1, Math.min(5, p?.vip_level ?? 1))}`,
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background/30">
              <Crown className="h-4.5 w-4.5 text-primary" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold">VIP</span>
              <span className="block text-[10px] text-muted-foreground">
                {(p?.vip_level ?? 0) > 0 ? `مستوى ${p?.vip_level} · إدارة` : "تفعيل المميزات"}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPrivSheet("cvip")}
            className="svip-showcase flex items-center gap-2 p-3 text-start transition-transform active:scale-[0.98]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background/30">
              <Sparkles className="h-4.5 w-4.5 text-accent" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold">SVIP</span>
              <span className="block text-[10px] text-muted-foreground">
                {p?.is_cvip ? "مفعّل · إدارة" : "تفعيل المميزات"}
              </span>
            </span>
          </button>
        </div>

        <VipCvipSheet
          open={privSheet !== null}
          onOpenChange={(v) => !v && setPrivSheet(null)}
          mode={privSheet ?? "vip"}
          currentVip={p?.vip_level ?? 0}
          isCvip={Boolean(p?.is_cvip)}
          cvipExpiresAt={
            (p as { cvip_expires_at?: string | null } | undefined)?.cvip_expires_at ?? null
          }
        />

        {p?.status_text && (
          <p className="mt-3 inline-block rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
            {p.status_text}
          </p>
        )}

        {p?.bio && <p className="mt-4 text-sm text-muted-foreground">{p.bio}</p>}

        {editing && (
          <div className="mt-4 space-y-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              className="h-12 rounded-2xl bg-surface-2"
            />
            <Input
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              maxLength={40}
              placeholder="حالتك الآن (مثال: متاح للدردشة)"
              className="h-12 rounded-2xl bg-surface-2"
            />
            <div>
              <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">لون اسمك</p>
              <div className="flex flex-wrap gap-2">
                {["", "#f0b90b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"].map((c) => (
                  <button
                    key={c || "default"}
                    type="button"
                    onClick={() => setNameColor(c)}
                    className={cn(
                      "h-8 w-8 rounded-full border-2",
                      nameColor === c ? "border-primary" : "border-border/60",
                    )}
                    style={c ? { background: c } : undefined}
                    aria-label={c ? `لون ${c}` : "اللون الافتراضي"}
                  >
                    {!c && <span className="text-[9px] font-bold">VIP</span>}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={160}
              placeholder="نبذة عنك"
              className="rounded-2xl bg-surface-2"
            />
            <Button
              onClick={() => void saveProfile()}
              disabled={saving}
              className="h-12 w-full rounded-2xl gradient-gold font-bold text-primary-foreground"
            >
              حفظ
            </Button>
          </div>
        )}
      </div>

      {visitors.data && visitors.data.length > 0 && (
        <section className="surface-card mt-4 p-4">
          <p className="mb-3 text-sm font-black">زوّار ملفك</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {visitors.data.map((v) => (
              <Link
                key={v.visitor_id}
                to="/u/$publicId"
                params={{ publicId: v.profiles?.public_id ?? "" }}
                className="flex w-16 shrink-0 flex-col items-center gap-1"
              >
                <UserAvatar
                  src={v.profiles?.avatar_url}
                  frame={v.profiles?.frame_url}
                  name={v.profiles?.display_name}
                  size={48}
                  vipLevel={v.profiles?.vip_level ?? 0}
                />
                <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                  {v.profiles?.display_name ?? "زائر"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {userId && <RelationshipShowcase userId={userId} own />}
      {userId && <ProfileShowcase userId={userId} own />}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link to="/wallet" className="surface-card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-gold">
            <Coins className="h-5 w-5 text-primary-foreground" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">المحفظة</span>
            <span className="block truncate text-sm font-bold">
              {(wallet.data?.coins ?? 0).toLocaleString("en-US")}
            </span>
          </span>
        </Link>
        <Link to="/store" className="surface-card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15">
            <Crown className="h-5 w-5 text-primary" />
          </span>
          <span className="text-sm font-bold">المتجر</span>
        </Link>
        <button
          type="button"
          onClick={() => setBagOpen(true)}
          className="surface-card flex items-center gap-3 p-4 text-start"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15">
            <Backpack className="h-5 w-5 text-accent" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold">حقيبتي</span>
            <span className="block text-[10px] text-muted-foreground">
              {(myItems.data?.length ?? 0).toLocaleString("en-US")} عنصر
            </span>
          </span>
        </button>
        <Link to="/messages" className="surface-card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15">
            <Users className="h-5 w-5 text-primary" />
          </span>
          <span className="text-sm font-bold">الرسائل</span>
        </Link>
        <Link to="/families" className="surface-card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15">
            <Users className="h-5 w-5 text-accent" />
          </span>
          <span className="text-sm font-bold">العائلات</span>
        </Link>
        <Link to="/tasks" className="surface-card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-gold">
            <ListChecks className="h-5 w-5 text-primary-foreground" />
          </span>
          <span className="text-sm font-bold">المهام والجوائز</span>
        </Link>
        <Link to="/search" className="surface-card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15">
            <Search className="h-5 w-5 text-primary" />
          </span>
          <span className="text-sm font-bold">البحث الموحّد</span>
        </Link>
        <Link to="/help" className="surface-card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15">
            <BookOpen className="h-5 w-5 text-accent" />
          </span>
          <span className="text-sm font-bold">مركز المساعدة</span>
        </Link>
        <Link to="/gift-log" className="surface-card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15">
            <Gift className="h-5 w-5 text-primary" />
          </span>
          <span className="text-sm font-bold">سجل الهدايا</span>
        </Link>
        <Link to="/support" className="surface-card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15">
            <LifeBuoy className="h-5 w-5 text-primary" />
          </span>
          <span className="text-sm font-bold">الدعم والشكاوى</span>
        </Link>
        {isAdmin.data && (
          <Link to="/owner-stats" className="surface-card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/15">
              <BarChart3 className="h-5 w-5 text-accent" />
            </span>
            <span className="text-sm font-bold">الإحصائيات</span>
          </Link>
        )}
        {canOpenAdmin && (
          <Link
            to="/admin"
            search={{ section: undefined }}
            className="surface-card flex items-center gap-3 p-4"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15">
              <Shield className="h-5 w-5 text-primary" />
            </span>
            <span className="text-sm font-bold">
              {isAdmin.data
                ? "الإدارة"
                : (adminSections.data ?? []).length === 1
                  ? adminSectionLabel((adminSections.data ?? [])[0]!)
                  : "الإدارة"}
            </span>
          </Link>
        )}
      </div>

      {/* صلاحياتي الإدارية — قسم مستقل داخل حسابي يعرض الأقسام المخصصة لي فقط */}
      {(adminSections.data ?? []).length > 0 && (
        <section className="surface-card mt-4 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/15">
              <Shield className="h-4 w-4 text-primary" />
            </span>
            <div>
              <p className="text-sm font-black">صلاحياتي</p>
              <p className="text-[10px] text-muted-foreground">
                {(adminSections.data ?? []).includes("*")
                  ? "وصول كامل لكل أقسام الإدارة"
                  : `${(adminSections.data ?? []).length} قسم مخصص لحسابك`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(adminSections.data ?? []).includes("*") ? (
              <Link
                to="/admin"
                search={{ section: undefined }}
                className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary"
              >
                كل الأقسام
              </Link>
            ) : (
              (adminSections.data ?? []).map((key) => (
                <Link
                  key={key}
                  to="/admin"
                  search={{ section: key }}
                  className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary"
                >
                  {adminSectionLabel(key)}
                </Link>
              ))
            )}
          </div>
        </section>
      )}

      <AppearanceSettings />

      {/* حقيبتي — كل ما اشتريته من المتجر بصوره مع التفعيل المباشر */}
      <Sheet open={bagOpen} onOpenChange={setBagOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-start">حقيبتي</SheetTitle>
          </SheetHeader>
          {(myItems.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              حقيبتك فارغة — اشترِ عناصر من المتجر لتظهر هنا.
            </p>
          ) : (
            <>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {BAG_SECTIONS.map((s) => {
                  const count =
                    s.key === "all"
                      ? (myItems.data?.length ?? 0)
                      : (myItems.data ?? []).filter(
                          (i) =>
                            (i.store_items as { category?: string } | null)?.category === s.key,
                        ).length;
                  if (count === 0 && s.key !== "all") return null;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setBagTab(s.key)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors",
                        bagTab === s.key
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-surface-2 text-muted-foreground",
                      )}
                    >
                      {s.label} ({count})
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 pb-4">
                {(myItems.data ?? [])
                  .filter(
                    (i) =>
                      bagTab === "all" ||
                      (i.store_items as { category?: string } | null)?.category === bagTab,
                  )
                  .map((it) => {
                    const si = it.store_items as {
                      name?: string;
                      category?: string;
                      image_url?: string | null;
                    } | null;
                    return (
                      <div key={it.id} className="surface-card overflow-hidden">
                        <div className="flex h-24 items-center justify-center gradient-surface p-1">
                          <CosmeticImage
                            url={si?.image_url ?? null}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="p-2 text-center">
                          <p className="truncate text-[11px] font-semibold">{si?.name ?? "عنصر"}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {it.expires_at
                              ? new Date(it.expires_at).toLocaleDateString("ar")
                              : "دائم"}
                          </p>
                          <button
                            disabled={equipping === it.id}
                            onClick={() => void toggleEquip(it.id, !it.is_equipped)}
                            className={cn(
                              "mt-2 w-full rounded-lg border px-2 py-1.5 text-[10px]",
                              it.is_equipped
                                ? "border-primary bg-primary/15 text-primary"
                                : "border-border bg-surface-2 text-muted-foreground",
                            )}
                          >
                            {it.is_equipped ? "مُستخدم" : "استخدم"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Button
        variant="outline"
        onClick={() => void signOut()}
        className="mt-6 h-12 w-full rounded-2xl border-destructive/40 text-destructive"
      >
        <LogOut className="me-2 h-4 w-4" /> تسجيل الخروج من هذا الجهاز
      </Button>
    </AppShell>
  );
}

const BAG_SECTIONS: { key: string; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "profile_frame", label: "الإطارات" },
  { key: "profile_background", label: "خلفيات الملف" },
  { key: "room_background", label: "خلفيات الغرف" },
  { key: "mic_decoration", label: "زينة المايك" },
  { key: "room_decoration", label: "زينة الغرفة" },
  { key: "badge", label: "الشارات" },
  { key: "effect", label: "التأثيرات" },
];
