import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCrownUnread } from "@/lib/crown.functions";
import { Bell, Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useSupabaseSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/messages/")({
  head: () => ({
    meta: [
      { title: "الرسائل — التاج" },
      {
        name: "description",
        content: "محادثاتك الخاصة مع الأصدقاء داخل التاج، بتحديث مباشر للرسائل الجديدة.",
      },
      { property: "og:title", content: "الرسائل — التاج" },
      { property: "og:description", content: "دردشة خاصة مباشرة مع أصدقائك." },
    ],
  }),
  component: MessagesPage,
});

type Row = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
};

function MessagesPage() {
  const { userId } = useSupabaseSession();
  const fetchCrownUnread = useServerFn(getCrownUnread);
  const crownUnread = useQuery({
    queryKey: ["crown-unread", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      try {
        return await fetchCrownUnread();
      } catch {
        return { unread: 0 };
      }
    },
    staleTime: 30_000,
  });
  const notifUnread = useQuery({
    queryKey: ["notifications-unread", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 20_000,
  });

  const threads = useQuery({
    queryKey: ["dm-threads", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id, sender_id, receiver_id, body, created_at, read_at")
        .or(`sender_id.eq.${userId!},receiver_id.eq.${userId!}`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const rows = (data ?? []) as Row[];
      const map = new Map<string, Row>();
      for (const row of rows) {
        const other = row.sender_id === userId ? row.receiver_id : row.sender_id;
        if (!map.has(other)) map.set(other, row);
      }
      const ids = [...map.keys()];
      if (ids.length === 0) return [];

      const { data: people } = await supabase
        .from("profiles")
        .select("id, public_id, display_name, avatar_url, vip_level, is_online, hide_online")
        .in("id", ids);

      return ids.map((id) => ({
        other: (people ?? []).find((p) => p.id === id) ?? null,
        last: map.get(id)!,
      }));
    },
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("dm-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        () => {
          void threads.refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, threads]);

  return (
    <AppShell
      header={
        <div className="sticky top-0 z-30 flex items-center gap-3 bg-background/85 px-4 py-3 backdrop-blur-xl">
          <Link
            to="/friends"
            aria-label="الأصدقاء"
            className="flex h-10 w-10 items-center justify-center rounded-2xl gradient-gold text-primary-foreground"
          >
            <Users className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">الرسائل</h1>
            <p className="text-[11px] text-muted-foreground">محادثاتك الخاصة · الأصدقاء من الزر</p>
          </div>
          <Link
            to="/notifications"
            aria-label="الإشعارات"
            className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-surface"
          >
            <Bell className="h-5 w-5" />
            {(notifUnread.data ?? 0) > 0 && (
              <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background" />
            )}
          </Link>
        </div>
      }
    >
      <Link
        to="/crown"
        className="mb-3 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-l from-amber-500/15 to-transparent px-3 py-3"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/20 text-lg">
          👑
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-bold">
            رسائل التاج
            {(crownUnread.data?.unread ?? 0) > 0 && (
              <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-black text-white">
                {crownUnread.data?.unread}
              </span>
            )}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            رسائل رسمية من التاج: نتائج الأحداث والإعلانات
          </span>
        </span>
      </Link>
      {threads.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (threads.data?.length ?? 0) === 0 ? (
        <EmptyState title="لا توجد محادثات" hint="ابدأ محادثة من ملف أي مستخدم" />
      ) : (
        <div className="space-y-2">
          {threads.data?.map(({ other, last }) =>
            other ? (
              <Link
                key={other.id}
                to="/messages/$userId"
                params={{ userId: other.id }}
                className="surface-card flex items-center gap-3 p-3"
              >
                <UserAvatar
                  src={other.avatar_url}
                  name={other.display_name}
                  size={48}
                  vipLevel={other.vip_level}
                  online={other.is_online && !other.hide_online}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{other.display_name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {last.body ?? "رسالة"}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(last.created_at).toLocaleTimeString("ar", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </Link>
            ) : null,
          )}
        </div>
      )}
    </AppShell>
  );
}
