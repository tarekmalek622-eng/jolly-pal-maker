import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Coins, Crown, LogOut, Shield, Sparkles, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { AppShell, PageHeader } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useIsAdmin, useMyProfile, useSupabaseSession, useWallet } from "@/hooks/use-session";
import { uploadUserImage } from "@/lib/media";
import { screenProfilePhoto } from "@/lib/moderation.functions";
import { clearDeviceCredentials } from "@/lib/device-account";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({
    meta: [
      { title: "ملفي — صوتك" },
      { name: "description", content: "عدّل اسمك وصورتك ونبذتك، وتابع مستواك وXP وVIP وعناصرك المملوكة." },
      { property: "og:title", content: "ملفي — صوتك" },
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
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);

  const counts = useQuery({
    queryKey: ["social-counts", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [followers, following, friends] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId!),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId!),
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

  const [equipping, setEquipping] = useState<string | null>(null);

  async function toggleEquip(userItemId: string, equip: boolean) {
    setEquipping(userItemId);
    const { error } = await supabase.rpc("equip_item", { _user_item_id: userItemId, _equip: equip });
    setEquipping(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(equip ? "تم تطبيق العنصر" : "تم إزالة العنصر");
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
      .update({ display_name: name.trim(), bio: bio.trim() })
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
      const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", userId);
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
  const xpForNext = ((p?.level ?? 1) ) * 500;

  return (
    <AppShell header={<PageHeader title="ملفي" />}>
      <div className="surface-card p-5">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => fileRef.current?.click()} className="relative">
            <UserAvatar src={p?.avatar_url} name={p?.display_name} size={72} vipLevel={p?.vip_level ?? 0} frame={p?.frame_url} />
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
            <p className="truncate text-lg font-bold">{p?.display_name ?? "..."}</p>
            <p className="text-[11px] text-muted-foreground">ID: {p?.public_id ?? "—"}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px]">مستوى {p?.level ?? 1}</span>
              {(p?.vip_level ?? 0) > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                  <Crown className="h-3 w-3" /> VIP {p?.vip_level}
                </span>
              )}
              {p?.is_cvip && (
                <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent">
                  <Sparkles className="h-3 w-3" /> CVIP
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full gradient-gold"
              style={{ width: `${Math.min(100, ((p?.xp ?? 0) % 500) / 5)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            XP {(p?.xp ?? 0).toLocaleString("en-US")} / {xpForNext.toLocaleString("en-US")}
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

        {p?.bio && <p className="mt-4 text-sm text-muted-foreground">{p.bio}</p>}

        <Button
          variant="outline"
          onClick={() => {
            setName(p?.display_name ?? "");
            setBio(p?.bio ?? "");
            setEditing((v) => !v);
          }}
          className="mt-4 h-11 w-full rounded-2xl"
        >
          {editing ? "إلغاء" : "تعديل الملف"}
        </Button>

        {editing && (
          <div className="mt-4 space-y-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} className="h-12 rounded-2xl bg-surface-2" />
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

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link to="/wallet" className="surface-card flex items-center gap-2 p-4 text-sm font-bold">
          <Coins className="h-5 w-5 text-primary" />
          {(wallet.data?.coins ?? 0).toLocaleString("en-US")}
        </Link>
        <Link to="/store" className="surface-card flex items-center gap-2 p-4 text-sm font-bold">
          <Crown className="h-5 w-5 text-primary" /> المتجر
        </Link>
        <Link to="/messages" className="surface-card flex items-center gap-2 p-4 text-sm font-bold">
          <Users className="h-5 w-5 text-primary" /> الرسائل
        </Link>
        {isAdmin.data && (
          <Link to="/admin" className="surface-card flex items-center gap-2 p-4 text-sm font-bold">
            <Shield className="h-5 w-5 text-primary" /> الإدارة
          </Link>
        )}
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold">عناصري</h2>
        {(myItems.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">لا تملك عناصر بعد — تفضل بزيارة المتجر.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {myItems.data?.map((it) => (
              <div key={it.id} className="surface-card p-3 text-center">
                <p className="truncate text-[11px] font-semibold">
                  {(it.store_items as { name?: string } | null)?.name ?? "عنصر"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {it.expires_at ? new Date(it.expires_at).toLocaleDateString("ar") : "دائم"}
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
            ))}
          </div>
        )}
      </section>

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
