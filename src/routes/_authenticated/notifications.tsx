import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useSupabaseSession } from "@/hooks/use-session";
import { NOTIFICATION_GROUPS, groupKinds, kindMeta } from "@/lib/notification-groups";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "الإشعارات — التاج" },
      {
        name: "description",
        content:
          "مركز إشعارات التاج: الهدايا والأصدقاء والعلاقات والعائلات والأحداث والجوائز وVIP والنظام.",
      },
      { property: "og:title", content: "الإشعارات — التاج" },
      { property: "og:description", content: "كل إشعاراتك في مكان واحد مع تصنيفات وتحديث لحظي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

type Row = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

function NotificationsPage() {
  const { userId } = useSupabaseSession();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("all");

  const list = useQuery({
    queryKey: ["notifications", userId, tab],
    enabled: Boolean(userId),
    queryFn: async () => {
      let query = supabase
        .from("notifications")
        .select("id, kind, title, body, read_at, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(100);
      const kinds = groupKinds(tab);
      if (kinds.length > 0) query = query.in("kind", kinds);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  // فتح الصفحة = قراءة الإشعارات الظاهرة، مرة واحدة فقط لكل إشعار.
  useEffect(() => {
    const unreadIds = (list.data ?? []).filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0 || !userId) return;
    void (async () => {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds)
        .eq("user_id", userId);
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    })();
  }, [list.data, userId, queryClient]);

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId!)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
    onError: () => toast.error("تعذر تعليم الإشعارات كمقروءة"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => void list.refetch(),
    onError: () => toast.error("تعذر حذف الإشعار"),
  });

  return (
    <AppShell
      header={
        <div className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-3 backdrop-blur-xl">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-gold text-primary-foreground">
            <Bell className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">الإشعارات</h1>
            <p className="text-[11px] text-muted-foreground">
              هدايا · أصدقاء · علاقات · عائلات · أحداث · جوائز · VIP · النظام
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => markAll.mutate()}
            className="h-9 gap-1 rounded-xl px-3 text-[11px]"
          >
            <CheckCheck className="h-4 w-4" />
            قرأت الكل
          </Button>
        </div>
      }
    >
      <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {NOTIFICATION_GROUPS.map((g) => (
          <button
            key={g.key}
            onClick={() => setTab(g.key)}
            className={cn(
              "shrink-0 rounded-2xl px-3 py-1.5 text-[11px] font-semibold transition-colors",
              tab === g.key
                ? "gradient-gold text-primary-foreground"
                : "bg-surface text-muted-foreground",
            )}
          >
            {g.emoji} {g.label}
          </button>
        ))}
      </div>

      <Link
        to="/crown"
        className="mb-3 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-l from-amber-500/15 to-transparent px-3 py-3"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/20 text-lg">
          👑
        </span>
        <span className="min-w-0 flex-1 text-sm font-bold">
          رسائل التاج الرسمية
          <span className="block text-[11px] font-normal text-muted-foreground">
            إعلانات ونتائج الأحداث
          </span>
        </span>
      </Link>

      {list.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (list.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="لا توجد إشعارات"
          hint="ستظهر هنا الهدايا والأصدقاء والعلاقات والأحداث والجوائز"
        />
      ) : (
        <div className="space-y-2 pb-6">
          {list.data?.map((n) => {
            const meta = kindMeta(n.kind);
            return (
              <div
                key={n.id}
                className={cn(
                  "surface-card flex items-start gap-3 p-3",
                  !n.read_at && "border-primary/40",
                )}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-lg">
                  {meta.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    {!n.read_at && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
                    )}
                  </div>
                  {n.body && (
                    <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{n.body}</p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {meta.label} ·{" "}
                    {new Date(n.created_at).toLocaleString("ar", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <button
                  onClick={() => remove.mutate(n.id)}
                  className="p-1 text-muted-foreground"
                  aria-label="حذف الإشعار"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
