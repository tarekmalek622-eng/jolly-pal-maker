import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState, PageHeader } from "@/components/AppShell";
import { UserAvatar } from "@/components/UserAvatar";
import { useSupabaseSession } from "@/hooks/use-session";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "الرسائل — صوتك" },
      { name: "description", content: "محادثاتك الخاصة مع الأصدقاء داخل صوتك، بتحديث مباشر للرسائل الجديدة." },
      { property: "og:title", content: "الرسائل — صوتك" },
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
        .select("id, public_id, display_name, avatar_url, vip_level, is_online")
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, () => {
        void threads.refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, threads]);

  return (
    <AppShell header={<PageHeader title="الرسائل" subtitle="محادثاتك الخاصة" />}>
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
                <UserAvatar src={other.avatar_url} name={other.display_name} size={48} vipLevel={other.vip_level} online={other.is_online} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{other.display_name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{last.body ?? "رسالة"}</p>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(last.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </Link>
            ) : null,
          )}
        </div>
      )}
    </AppShell>
  );
}
