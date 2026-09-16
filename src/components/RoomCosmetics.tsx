import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { applyRoomCosmetic } from "@/lib/rooms.functions";
import { resolveMediaUrl } from "@/lib/media";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OwnedItem = {
  id: string;
  expires_at: string | null;
  store_items: { name: string; category: string; image_url: string | null } | null;
};

const TARGETS = [
  { key: "background" as const, label: "خلفية الغرفة", category: "room_background" },
  { key: "decoration" as const, label: "زينة الغرفة", category: "room_decoration" },
  { key: "mic" as const, label: "زينة مايكي", category: "mic_decoration" },
];

export function CosmeticImage({ url, className }: { url: string | null; className?: string }) {
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void resolveMediaUrl(url).then((next) => active && setResolved(next));
    return () => {
      active = false;
    };
  }, [url]);
  if (!resolved) return null;
  return <img src={resolved} alt="" loading="lazy" className={className} />;
}

export function RoomCosmetics({
  roomId,
  userId,
  isOwner,
  open,
  onOpenChange,
  onApplied,
}: {
  roomId: string;
  userId: string | null;
  isOwner: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApplied: () => void;
}) {
  const [target, setTarget] = useState<"background" | "decoration" | "mic">(isOwner ? "background" : "mic");
  const apply = useServerFn(applyRoomCosmetic);

  const owned = useQuery({
    queryKey: ["my-cosmetics", userId],
    enabled: Boolean(userId) && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_items")
        .select("id, expires_at, store_items(name, category, image_url)")
        .eq("user_id", userId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OwnedItem[];
    },
  });

  const save = useMutation({
    mutationFn: async (userItemId: string | null) => apply({ data: { roomId, userItemId, target } }),
    onSuccess: () => {
      toast.success("تم تطبيق التزيين داخل الغرفة");
      onApplied();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر التطبيق"),
  });

  const targets = TARGETS.filter((t) => (t.key === "mic" ? true : isOwner));
  const category = TARGETS.find((t) => t.key === target)?.category;
  const list = (owned.data ?? []).filter((o) => o.store_items?.category === category);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-sm">تزيين الغرفة</SheetTitle>
        </SheetHeader>

        <div className="mt-3 flex gap-1.5">
          {targets.map((t) => (
            <button
              key={t.key}
              onClick={() => setTarget(t.key)}
              className={cn(
                "flex-1 rounded-full border px-2 py-2 text-[11px] font-bold transition-colors",
                target === t.key
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {owned.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            لا تملك عناصر من هذا النوع — اشترِ من المتجر ثم طبّقها هنا.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {list.map((o) => (
              <button
                key={o.id}
                disabled={save.isPending}
                onClick={() => save.mutate(o.id)}
                className="overflow-hidden rounded-2xl border border-border bg-surface-2 p-1.5 text-center transition-transform active:scale-95"
              >
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-xl bg-surface">
                  <CosmeticImage url={o.store_items?.image_url ?? null} className="h-full w-full object-cover" />
                </div>
                <p className="mt-1 truncate text-[10px] font-bold">{o.store_items?.name}</p>
              </button>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          disabled={save.isPending}
          onClick={() => save.mutate(null)}
          className="mt-3 h-10 w-full rounded-xl text-xs"
        >
          إزالة التزيين الحالي
        </Button>
      </SheetContent>
    </Sheet>
  );
}
