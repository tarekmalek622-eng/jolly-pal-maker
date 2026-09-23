import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** شريط الصيانة الظاهر لكل المستخدمين عند تفعيله من أدوات الإدارة. */
export function MaintenanceBanner() {
  const q = useQuery({
    queryKey: ["maintenance-public"],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", "maintenance")
        .maybeSingle();
      return (data?.value ?? { on: false, message: "" }) as { on: boolean; message: string };
    },
  });
  if (!q.data?.on) return null;
  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warning px-3 py-2 text-center text-xs font-bold text-primary-foreground"
    >
      <Wrench className="h-4 w-4 shrink-0" />
      {q.data.message || "التطبيق في وضع الصيانة حالياً، قد تتوقف بعض الخدمات مؤقتاً."}
    </div>
  );
}
