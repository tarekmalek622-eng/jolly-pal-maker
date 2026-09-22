import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { RoomCard, type RoomRow } from "@/components/RoomCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSupabaseSession } from "@/hooks/use-session";
import { uploadUserImage } from "@/lib/media";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/rooms/")({
  head: () => ({
    meta: [
      { title: "الغرف الصوتية — التاج" },
      { name: "description", content: "تصفح كل الغرف الصوتية حسب التصنيف أو أنشئ غرفتك الخاصة بمايكات وخلفية مخصصة." },
      { property: "og:title", content: "الغرف الصوتية — التاج" },
      { property: "og:description", content: "غرف عامة وخاصة، مايكات متعددة، دردشة وهدايا." },
    ],
  }),
  component: RoomsPage,
});

const CATEGORIES = ["عام", "دردشة", "موسيقى", "ألعاب", "تعارف", "ثقافة", "رياضة", "قرآن"];

function RoomsPage() {
  const { userId } = useSupabaseSession();
  const [category, setCategory] = useState("الكل");
  const [open, setOpen] = useState(false);

  const rooms = useQuery({
    queryKey: ["rooms", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, room_code, name, description, image_url, category, room_type, member_count, popularity, created_at, owner_id, mic_count, xp, is_verified")
        .eq("is_disabled", false)
        .order("member_count", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as RoomRow[];
    },
    refetchInterval: 20000,
  });

  const myRooms = useQuery({
    queryKey: ["rooms", "mine", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, room_code, name, description, image_url, category, room_type, member_count, popularity, created_at, owner_id, mic_count, xp, is_verified")
        .eq("owner_id", userId!);
      if (error) throw error;
      return (data ?? []) as RoomRow[];
    },
  });

  const filtered = (rooms.data ?? []).filter((r) => category === "الكل" || r.category === category);

  return (
    <AppShell
      header={
        <PageHeader
          title="الغرف"
          subtitle="اختر غرفة وادخل على المايك"
          action={
            <Button
              onClick={() => setOpen(true)}
              className="h-10 rounded-2xl gradient-gold text-xs font-bold text-primary-foreground"
            >
              <Plus className="me-1 h-4 w-4" /> غرفة جديدة
            </Button>
          }
        />
      }
    >
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {["الكل", ...CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs",
              category === c ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted-foreground",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {(myRooms.data?.length ?? 0) > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold text-muted-foreground">غرفي</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {myRooms.data?.map((r) => <RoomCard key={r.id} room={r} />)}
            </div>
          </div>
        </section>
      )}

      {rooms.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="لا توجد غرف في هذا التصنيف" hint="أنشئ أول غرفة الآن" />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((r) => <RoomCard key={r.id} room={r} />)}
          </div>
        </div>
      )}

      <CreateRoomSheet open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}

function CreateRoomSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { userId } = useSupabaseSession();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("عام");
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [micCount, setMicCount] = useState(10);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!userId) return;
    if (name.trim().length < 2) {
      toast.error("اكتب اسم الغرفة");
      return;
    }
    if (isPrivate && password.trim().length < 4) {
      toast.error("كلمة مرور الغرفة الخاصة 4 أحرف على الأقل");
      return;
    }
    setSaving(true);
    try {
      let imagePath: string | null = null;
      if (image) imagePath = await uploadUserImage("rooms", userId, image);

      const { data, error } = await supabase.rpc("create_room", {
        _name: name.trim(),
        _description: description.trim(),
        _category: category,
        _room_type: isPrivate ? "private" : "public",
        _password: isPrivate ? password.trim() : "",
        _mic_count: micCount,
        _image_url: imagePath ?? "",
        _background_url: "",
      });
      if (error) throw error;
      toast.success("تم إنشاء الغرفة");
      onOpenChange(false);
      const created = data as unknown as { id: string } | null;
      if (!created?.id) throw new Error("تعذر قراءة بيانات الغرفة");
      void navigate({ to: "/rooms/$roomId", params: { roomId: created.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر إنشاء الغرفة");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>غرفة جديدة</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 pb-6">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-surface"
          >
            {preview ? (
              <img src={preview} alt="صورة الغرفة" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-6 w-6 text-muted-foreground" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setImage(f);
                setPreview(URL.createObjectURL(f));
              }
              e.target.value = "";
            }}
          />

          <div className="space-y-2">
            <Label htmlFor="rname">اسم الغرفة</Label>
            <Input id="rname" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} className="h-12 rounded-2xl bg-surface" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rdesc">الوصف</Label>
            <Textarea id="rdesc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} className="rounded-2xl bg-surface" />
          </div>

          <div className="space-y-2">
            <Label>التصنيف</Label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs",
                    category === c ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted-foreground",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>عدد المايكات: {micCount}</Label>
            <div className="flex flex-wrap gap-2">
              {[4, 6, 8, 10, 12, 16].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMicCount(n)}
                  className={cn(
                    "h-10 w-12 rounded-xl border text-sm",
                    micCount === n ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-surface p-4">
            <div>
              <p className="text-sm font-semibold">غرفة خاصة</p>
              <p className="text-[11px] text-muted-foreground">الدخول بكلمة مرور فقط</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPrivate((v) => !v)}
              className={cn("h-7 w-12 rounded-full transition-colors", isPrivate ? "bg-primary" : "bg-surface-2")}
            >
              <span className={cn("block h-6 w-6 rounded-full bg-background transition-transform", isPrivate ? "translate-x-0" : "-translate-x-5")} />
            </button>
          </div>

          {isPrivate && (
            <div className="space-y-2">
              <Label htmlFor="rpass">كلمة مرور الغرفة</Label>
              <Input id="rpass" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-2xl bg-surface" />
            </div>
          )}

          <Button
            onClick={() => void submit()}
            disabled={saving}
            className="h-13 w-full rounded-2xl gradient-gold py-4 font-bold text-primary-foreground"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "إنشاء الغرفة"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
