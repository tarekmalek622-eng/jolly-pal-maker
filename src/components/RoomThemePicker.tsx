import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const ROOM_THEMES = [
  { key: "royal", label: "ملكي", className: "theme-royal" },
  { key: "night", label: "ليلي", className: "theme-night" },
  { key: "ocean", label: "بحري", className: "theme-ocean" },
  { key: "rose", label: "وردي", className: "theme-rose" },
  { key: "gold", label: "ذهبي", className: "theme-gold" },
] as const;

export function roomThemeClass(theme: string | null | undefined) {
  return ROOM_THEMES.find((t) => t.key === theme)?.className ?? "theme-royal";
}

export function RoomThemePicker({
  roomId,
  current,
}: {
  roomId: string;
  current: string | null | undefined;
}) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async (theme: string) => {
      const { error } = await supabase
        .from("rooms")
        .update({ theme_style: theme })
        .eq("id", roomId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم تغيير ثيم الغرفة");
      void qc.invalidateQueries({ queryKey: ["room", roomId] });
      void qc.invalidateQueries({ queryKey: ["room-info", roomId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-surface/70 p-3">
      <p className="text-xs font-bold">ثيم الغرفة</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ROOM_THEMES.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate(t.key)}
            className={cn(
              "h-14 w-16 rounded-xl border text-[11px] font-bold",
              t.className,
              (current ?? "royal") === t.key
                ? "border-primary ring-2 ring-primary/50"
                : "border-border/60",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
