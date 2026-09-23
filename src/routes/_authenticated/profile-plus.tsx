import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Copy, ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useMyProfile, useSupabaseSession } from "@/hooks/use-session";
import { resolveMediaUrl, uploadUserImage } from "@/lib/media";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

const INTERESTS = ["غناء", "شعر", "ألعاب", "رياضة", "أفلام", "سفر", "طبخ", "قرآن", "تقنية", "موضة", "سيارات", "دردشة"];

export const Route = createFileRoute("/_authenticated/profile-plus")({
  head: () => ({
    meta: [
      { title: "تخصيص ملفي — التاج" },
      { name: "description", content: "ألبوم صور، إخفاء الاتصال، الاهتمامات، ورابط و QR لملفك." },
      { property: "og:title", content: "تخصيص ملفي — التاج" },
      { property: "og:description", content: "خصص ملفك الشخصي في التاج." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePlus,
});

function AlbumImg({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void resolveMediaUrl(path).then(setUrl);
  }, [path]);
  return url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /> : null;
}

function ProfilePlus() {
  const { userId } = useSupabaseSession();
  const profile = useMyProfile(userId);
  const p = profile.data as any;
  const [interests, setInterests] = useState<string[]>([]);
  const [hide, setHide] = useState(false);
  useEffect(() => {
    if (p) {
      setInterests(p.interests ?? []);
      setHide(Boolean(p.hide_online));
    }
  }, [p]);

  const photos = useQuery({
    queryKey: ["album", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db.from("profile_photos").select("id, url").eq("user_id", userId).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; url: string }[];
    },
  });

  const save = async (patch: Record<string, unknown>) => {
    const { error } = await db.from("profiles").update(patch).eq("id", userId);
    if (error) toast.error("تعذر الحفظ");
    else {
      toast.success("تم الحفظ");
      void profile.refetch();
    }
  };

  const upload = async (file: File) => {
    if (!userId) return;
    if ((photos.data?.length ?? 0) >= 9) {
      toast.error("الحد الأقصى 9 صور");
      return;
    }
    try {
      const path = await uploadUserImage("avatars", userId, file);
      await db.from("profile_photos").insert({ user_id: userId, url: path });
      void photos.refetch();
    } catch {
      toast.error("تعذر رفع الصورة");
    }
  };

  const link = typeof window !== "undefined" && p ? `${window.location.origin}/u/${p.public_id}` : "";

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-4 backdrop-blur-xl">
          <Link to="/me" className="p-1">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <p className="flex-1 text-sm font-bold">تخصيص ملفي</p>
        </header>
      }
    >
      <div className="space-y-3 pb-24">
        <section className="surface-card space-y-2 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">ألبوم الصور ({photos.data?.length ?? 0}/9)</p>
            <label className="flex cursor-pointer items-center gap-1 rounded-xl bg-surface px-3 py-1.5 text-[11px]">
              <ImagePlus className="h-4 w-4" /> إضافة
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(photos.data ?? []).map((ph) => (
              <div key={ph.id} className="relative aspect-square overflow-hidden rounded-xl bg-surface">
                <AlbumImg path={ph.url} />
                <button
                  aria-label="حذف"
                  onClick={async () => {
                    await db.from("profile_photos").delete().eq("id", ph.id);
                    void photos.refetch();
                  }}
                  className="absolute end-1 top-1 rounded-lg bg-background/80 p-1 text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-bold">إخفاء حالة الاتصال</p>
            <p className="text-[11px] text-muted-foreground">لن يرى الآخرون أنك متصل الآن</p>
          </div>
          <Switch
            checked={hide}
            onCheckedChange={(v) => {
              setHide(v);
              void save({ hide_online: v });
            }}
          />
        </section>

        <section className="surface-card space-y-2 p-4">
          <p className="text-sm font-bold">اهتماماتي (حتى 6)</p>
          <div className="flex flex-wrap gap-1.5">
            {INTERESTS.map((i) => {
              const on = interests.includes(i);
              return (
                <button
                  key={i}
                  onClick={() =>
                    setInterests((cur) => (on ? cur.filter((x) => x !== i) : cur.length < 6 ? [...cur, i] : cur))
                  }
                  className={cn("rounded-full px-3 py-1 text-[11px]", on ? "gradient-gold text-primary-foreground" : "bg-surface")}
                >
                  {i}
                </button>
              );
            })}
          </div>
          <Button onClick={() => void save({ interests })} className="h-9 w-full rounded-xl gradient-gold text-xs font-bold text-primary-foreground">
            حفظ الاهتمامات
          </Button>
        </section>

        {p && (
          <section className="surface-card space-y-3 p-4 text-center">
            <p className="text-sm font-bold">رابط ملفي و QR</p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(link)}`}
              alt="رمز QR لملفي"
              className="mx-auto h-44 w-44 rounded-2xl bg-card"
            />
            <p className="text-[11px] text-muted-foreground">امسح الرمز لإضافتك كصديق — ID {p.public_id}</p>
            <Button
              variant="outline"
              className="h-9 w-full rounded-xl text-xs"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                toast.success("تم نسخ الرابط");
              }}
            >
              <Copy className="me-1 h-4 w-4" /> نسخ رابط ملفي
            </Button>
          </section>
        )}
      </div>
    </AppShell>
  );
}
